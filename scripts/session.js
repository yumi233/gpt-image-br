const fs = require("fs");
const path = require("path");
const { SESSION_STATE_FILE, PROFILE_DIR } = require("./config");

/**
 * 将当前浏览器上下文的所有 Cookies 与 LocalStorage 持久化存储到 session_state.json
 */
async function saveSessionState(context, targetPath = SESSION_STATE_FILE) {
  try {
    if (!context) return null;

    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const state = await context.storageState();
    const cookies = await context.cookies(["https://chatgpt.com", "https://openai.com", "https://auth0.openai.com"]);

    const finalState = {
      savedAt: new Date().toISOString(),
      cookies: state.cookies || cookies || [],
      origins: state.origins || []
    };

    fs.writeFileSync(targetPath, JSON.stringify(finalState, null, 2), "utf-8");
    console.log(`[会话持久化] 登录会话与 Cookies 已成功备份至: ${targetPath}`);
    return finalState;
  } catch (err) {
    console.warn(`[会话持久化] 备份会话失败 (非致命): ${err.message}`);
    return null;
  }
}

/**
 * 恢复保存的 session_state.json 到浏览器上下文中
 */
async function restoreSessionState(context, targetPath = SESSION_STATE_FILE) {
  try {
    if (!context || !fs.existsSync(targetPath)) return false;

    const content = fs.readFileSync(targetPath, "utf-8");
    const state = JSON.parse(content);

    if (state.cookies && state.cookies.length > 0) {
      await context.addCookies(state.cookies);
      console.log(`[会话持久化] 已注入 ${state.cookies.length} 个持久化 Cookies。`);
      return true;
    }
  } catch (err) {
    console.warn(`[会话持久化] 恢复会话失败 (非致命): ${err.message}`);
  }
  return false;
}

/**
 * 从 ChatGPT 页面提取当前登录账号信息与会员等级
 */
async function extractUserInfo(page) {
  try {
    return await page.evaluate(() => {
      const userBtn = document.querySelector('button[data-testid="profile-button"], button[aria-label*="User profile"], button[aria-label*="个人资料"], div[data-testid="user-profile-menu"]');
      let name = "已登录用户";
      let email = "";
      let plan = "Standard";

      if (userBtn) {
        name = userBtn.innerText?.trim() || userBtn.getAttribute("aria-label") || name;
      }

      const bodyText = document.body.innerText || "";
      if (bodyText.includes("ChatGPT Plus") || bodyText.includes("Plus 订阅") || document.querySelector('[data-testid="pricing-plan-badge"]')) {
        plan = "ChatGPT Plus";
      } else if (bodyText.includes("ChatGPT Pro") || bodyText.includes("Pro 订阅")) {
        plan = "ChatGPT Pro";
      } else if (bodyText.includes("ChatGPT Team") || bodyText.includes("Team 团队版")) {
        plan = "ChatGPT Team";
      } else {
        plan = "ChatGPT Free / Standard";
      }

      return { name, email, plan };
    });
  } catch {
    return { name: "已登录用户", email: "", plan: "ChatGPT Account" };
  }
}

module.exports = {
  saveSessionState,
  restoreSessionState,
  extractUserInfo
};
