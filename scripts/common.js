const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const {
  CDP_URL,
  CDP_PORT,
  CHATGPT_URL,
  PROFILE_DIR,
  SESSION_STATE_FILE
} = require("./config");
const { ensureBrowserRunning } = require("./launcher");
const { saveSessionState, restoreSessionState, extractUserInfo } = require("./session");

/**
 * 连接 Chrome/Edge 调试端口，若未运行可自动启动
 */
async function connectBrowser(options = {}) {
  const autoLaunch = options.autoLaunch !== false;

  if (autoLaunch) {
    try {
      await ensureBrowserRunning({
        browserType: options.browserType,
        profileDir: options.profileDir || PROFILE_DIR,
        port: options.port || CDP_PORT
      });
    } catch (e) {
      console.warn(`[启动器提示] 尝试自动拉起浏览器时发生异常: ${e.message}`);
    }
  }

  try {
    const browser = await chromium.connectOverCDP(CDP_URL);
    return browser;
  } catch (err) {
    throw new Error(
      `无法连接到 Chrome 调试端口 (${CDP_URL})。\n` +
      `请运行 "launch_browser.bat" 或执行 "node cli.js launch" 启动带持久化 Profile 的浏览器。\n` +
      `错误详情: ${err.message}`
    );
  }
}

/**
 * 获取或创建 ChatGPT 页面并注入防检测脚本
 */
async function getChatGPTPage(browser) {
  const contexts = browser.contexts();
  if (!contexts || contexts.length === 0) {
    throw new Error("浏览器中没有可用的上下文 (Context)。");
  }

  const context = contexts[0];

  // 尝试恢复会话状态
  await restoreSessionState(context, SESSION_STATE_FILE);

  const pages = context.pages();
  let page = pages.find((p) => {
    const url = p.url();
    return (
      url.includes("chatgpt.com") ||
      url.includes("chat.openai.com") ||
      url.includes("accounts.google.com") ||
      url.includes("auth.openai.com")
    );
  });

  if (!page) {
    page = await context.newPage();
    console.log(`[页面] 未检测到 ChatGPT 标签页，正在打开 ${CHATGPT_URL} ...`);
    await page.goto(CHATGPT_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  }

  // 注入反自动化检测特征
  await page.addInitScript(() => {
    try {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      window.chrome = window.chrome || { runtime: {} };
    } catch {}
  }).catch(() => {});

  await page.bringToFront().catch(() => {});
  return page;
}

/**
 * 诊断当前页面的 ChatGPT 登录与人机验证状态
 */
async function checkLoginStatus(page) {
  try {
    await page.waitForTimeout(800);
    const url = page.url();

    // 1. 处于第三方登录或验证页面
    if (url.includes("accounts.google.com") || url.includes("auth.openai.com") || url.includes("/auth/")) {
      return {
        loggedIn: false,
        status: "need_login",
        message: "检测到正在进行 Google / OpenAI 登录或两步验证，请在浏览器中完成验证。"
      };
    }

    const content = await page.content();

    // 2. Cloudflare 人机验证
    if (
      content.includes("Just a moment...") ||
      content.includes("cf-turnstile") ||
      content.includes("Checking your browser")
    ) {
      return {
        loggedIn: false,
        status: "cloudflare_challenge",
        message: "检测到 Cloudflare 人机验证拦截，请在浏览器窗口中完成验证勾选。"
      };
    }

    // 3. 显式登录按钮
    const loginBtn = await page.$(
      'button[data-testid="login-button"], a[href*="/auth/login"], button:has-text("Log in"), button:has-text("登录"), button:has-text("Sign in")'
    );
    if (loginBtn && (await loginBtn.isVisible().catch(() => false))) {
      return {
        loggedIn: false,
        status: "need_login",
        message: "ChatGPT 尚未登录，请在已打开的浏览器中登录账号。"
      };
    }

    // 4. 检查已登录核心特征（输入框或个人信息头像）
    const input = await locatePromptInput(page);
    const hasAvatar = await page.$(
      'button[data-testid="profile-button"], div[data-testid="user-profile-menu"], button[aria-label*="profile"], button[aria-label*="个人资料"]'
    );

    if (input || hasAvatar) {
      const userInfo = await extractUserInfo(page);
      return {
        loggedIn: true,
        status: "ready",
        user: userInfo.name,
        plan: userInfo.plan,
        message: `ChatGPT 已就绪 (用户: ${userInfo.name}, 会员: ${userInfo.plan})`
      };
    }

    if (url.includes("chatgpt.com")) {
      // 页面正在加载或渲染
      await page.waitForTimeout(1500);
      const retryInput = await locatePromptInput(page);
      if (retryInput) {
        const userInfo = await extractUserInfo(page);
        return {
          loggedIn: true,
          status: "ready",
          user: userInfo.name,
          plan: userInfo.plan,
          message: `ChatGPT 已就绪 (用户: ${userInfo.name}, 会员: ${userInfo.plan})`
        };
      }
    }

    return {
      loggedIn: false,
      status: "need_login",
      message: "未检测到已登录的输入框或会话界面，请在浏览器中确认登录。"
    };
  } catch (err) {
    return {
      loggedIn: false,
      status: "error",
      message: `检测登录状态时发生异常: ${err.message}`
    };
  }
}

/**
 * 等待用户在浏览器中完成登录并自动保存会话
 */
async function waitForLogin(page, timeoutMs = 180000) {
  console.log("[登录助手] 正在等待登录完成（最长等待 3 分钟）...");
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const status = await checkLoginStatus(page);
    if (status.loggedIn) {
      console.log(`\n[登录助手] 登录成功！${status.message}`);
      const context = page.context();
      await saveSessionState(context, SESSION_STATE_FILE);
      return status;
    }

    if (status.status === "cloudflare_challenge") {
      process.stdout.write("\r[等待中] 请在浏览器中点击 Cloudflare 人机验证...");
    } else {
      process.stdout.write("\r[等待中] 请在浏览器中完成 Google/邮箱登录或两步验证...");
    }

    await page.waitForTimeout(2000);
  }

  throw new Error("登录超时，未能在规定时间内检测到登录成功状态。");
}

/**
 * 智能多重定位 ChatGPT 输入框
 */
async function locatePromptInput(page) {
  const selectors = [
    "#prompt-textarea",
    'div[contenteditable="true"]#prompt-textarea',
    'div[contenteditable="true"][data-placeholder]',
    'div.ProseMirror',
    'div[contenteditable="true"]',
    'textarea[data-id="root"]',
    'textarea[placeholder*="Message"]',
    'textarea[placeholder*="发消息"]',
    'textarea'
  ];

  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 600 }).catch(() => false)) {
        return el;
      }
    } catch {}
  }
  return null;
}

/**
 * 上传单张或多张参考图片
 */
async function uploadImages(page, imagePaths) {
  if (!imagePaths || imagePaths.length === 0) return;

  const validPaths = imagePaths.map((p) => path.resolve(p)).filter((p) => fs.existsSync(p));
  if (validPaths.length === 0) {
    console.warn("[警告] 传入的参考图片路径不存在，跳过图片上传。");
    return;
  }

  console.log(`[图生图] 正在上传 ${validPaths.length} 张参考图片至 ChatGPT...`);
  for (const p of validPaths) {
    console.log(` - 准备上传: ${p}`);
  }

  const fileInput = page.locator(
    'input[type="file"]#upload-photos, input[type="file"]#upload-files, input[type="file"]'
  ).first();

  await fileInput.setInputFiles(validPaths);

  console.log("[图生图] 等待图片上传与缩略图渲染...");
  await page.waitForTimeout(3500);
}

/**
 * 填充并发送提示词
 */
async function fillAndSendPrompt(page, text, imagePaths = []) {
  if (imagePaths && imagePaths.length > 0) {
    await uploadImages(page, imagePaths);
  }

  const input = await locatePromptInput(page);
  if (!input) {
    throw new Error("无法定位 ChatGPT 输入框，请检查页面是否正常加载。");
  }

  await input.click();
  await page.waitForTimeout(300);

  const isEditableDiv = await input.evaluate(
    (el) => el.getAttribute("contenteditable") === "true" || el.classList.contains("ProseMirror")
  );

  if (isEditableDiv) {
    await input.evaluate((el, val) => {
      el.focus();
      const p = el.querySelector("p");
      if (p) {
        p.innerText = val;
      } else {
        el.innerText = val;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, text);
    await page.keyboard.press("Space");
    await page.keyboard.press("Backspace");
  } else {
    await input.fill(text);
  }

  await page.waitForTimeout(600);

  const sendBtnSelectors = [
    'button[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label="发送提示词"]',
    'button[aria-label="发送"]',
    'button:has(svg[data-icon="arrow-up"])',
    'button:has(path[d*="M15.192 8.906"])'
  ];

  let sent = false;
  for (const btnSel of sendBtnSelectors) {
    const btn = page.locator(btnSel).first();
    if (
      (await btn.isVisible({ timeout: 800 }).catch(() => false)) &&
      (await btn.isEnabled().catch(() => false))
    ) {
      await btn.click();
      sent = true;
      break;
    }
  }

  if (!sent) {
    await input.focus();
    await page.keyboard.press("Enter");
  }

  console.log("[指令] 提示词已发送，等待 ChatGPT 响应...");
}

/**
 * 开启新会话
 */
async function startNewChat(page) {
  try {
    const newChatBtn = page.locator(
      'a[href="/"], button:has-text("新聊天"), button:has-text("New chat"), a[aria-label="新聊天"], a[aria-label="New chat"]'
    ).first();

    if (await newChatBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await newChatBtn.click();
      await page.waitForTimeout(1200);
      console.log("[会话] 已成功开启新对话。");
    } else {
      await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1000);
    }
  } catch (e) {
    console.warn(`[会话提示] 开启新会话异常: ${e.message}`);
  }
}

module.exports = {
  connectBrowser,
  getChatGPTPage,
  checkLoginStatus,
  waitForLogin,
  locatePromptInput,
  uploadImages,
  fillAndSendPrompt,
  startNewChat,
  saveSessionState,
  restoreSessionState,
  extractUserInfo,
  CDP_URL,
  PROFILE_DIR,
  SESSION_STATE_FILE
};
