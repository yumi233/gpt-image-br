const fs = require("fs");
const { connectBrowser, getChatGPTPage, checkLoginStatus } = require("./common");
const { PROFILE_DIR, CDP_PORT, CDP_URL } = require("./config");
const { isPortListening } = require("./launcher");

async function main() {
  console.log("==================================================");
  console.log("          ChatGPT 浏览器插件环境诊断报告          ");
  console.log("==================================================");

  console.log(`[1] 配置检查:`);
  console.log(` - 专属 Profile 路径: ${PROFILE_DIR} (${fs.existsSync(PROFILE_DIR) ? "存在" : "未创建"})`);
  console.log(` - 调试端口配置: ${CDP_PORT} (${CDP_URL})`);

  const portOpen = await isPortListening(CDP_PORT);
  console.log(`\n[2] 浏览器运行状态:`);
  if (!portOpen) {
    console.log(` [!] 调试端口 (${CDP_PORT}) 当前未在监听。`);
    console.log(` [提示] 执行 "node cli.js launch" 或 "launch_browser.bat" 即可一键启动浏览器。`);
    process.exit(0);
  }

  console.log(` [✓] 调试端口 (${CDP_PORT}) 正在运行！`);

  let browser;
  try {
    console.log(`\n[3] 正在通过 CDP 连接浏览器并检测 ChatGPT...`);
    browser = await connectBrowser({ autoLaunch: false });

    const contexts = browser.contexts();
    const context = contexts[0];
    const pages = context.pages();
    console.log(` - 打开标签页数量: ${pages.length}`);

    for (let i = 0; i < Math.min(pages.length, 5); i++) {
      const p = pages[i];
      console.log(`   [${i + 1}] ${await p.title()} (${p.url()})`);
    }

    const page = await getChatGPTPage(browser);
    console.log(`\n[4] ChatGPT 账号与登录状态 (官方 Session 校验):`);
    const status = await checkLoginStatus(page);

    if (status.loggedIn) {
      console.log(` [✓] 登录状态: 已登录就绪`);
      console.log(` - 当前用户: ${status.user || "yumi"}`);
      console.log(` - 绑订邮箱: ${status.email || ""}`);
      console.log(` - 订阅计划: ${status.plan || "ChatGPT Plus"}`);
    } else {
      console.log(` [!] 登录状态: 未就绪 (${status.message})`);
      console.log(` [提示] 运行 "node cli.js login" 或在已打开的浏览器窗口中完成登录。`);
    }
  } catch (err) {
    console.error(`\n[✗] 检测过程中出现异常: ${err.message}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    process.exit(0);
  }
}

main();

