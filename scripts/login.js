const { connectBrowser, getChatGPTPage, checkLoginStatus, waitForLogin } = require("./common");
const { PROFILE_DIR } = require("./config");

async function main() {
  console.log("==================================================");
  console.log("       ChatGPT 专属持久化浏览器登录助手       ");
  console.log("==================================================");
  console.log(`[配置] 持久化 Profile 路径: ${PROFILE_DIR}`);

  let browser;
  try {
    console.log("\n[1/3] 正在启动或连接专属浏览器...");
    browser = await connectBrowser({ autoLaunch: true });

    console.log("[2/3] 正在打开 ChatGPT 并检测登录状态...");
    const page = await getChatGPTPage(browser);
    const status = await checkLoginStatus(page);

    if (status.loggedIn) {
      console.log(`\n[✓] 检测到当前已经处于登录状态！`);
      console.log(` - 用户: ${status.user || "已登录"}`);
      console.log(` - 邮箱: ${status.email || ""}`);
      console.log(` - 等级: ${status.plan || "ChatGPT"}`);
      console.log("\n==================================================");
      console.log(" [✓ 成功] 账号已就绪！此后生图无需重复登录。");
      console.log("==================================================");
      process.exit(0);
    }

    console.log(`\n[!] 当前未登录或遇到验证: ${status.message}`);
    console.log("[提示] 请在打开的浏览器窗口中完成登录 (支持 Google 登录 / 邮箱登录 / Microsoft 登录)...");

    const result = await waitForLogin(page, 300000);
    console.log("\n==================================================");
    console.log(" [✓ 成功] 登录成功并已永久保存至专属 Profile！");
    console.log(` - 用户: ${result.user || "已登录"}`);
    console.log(` - 邮箱: ${result.email || ""}`);
    console.log(` - 会员: ${result.plan || "ChatGPT"}`);
    console.log("==================================================");
  } catch (err) {
    console.error(`\n[✗ 错误] 登录助手异常: ${err.message}`);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    process.exit(0);
  }
}

main();
