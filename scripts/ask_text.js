const {
  connectBrowser,
  getChatGPTPage,
  checkLoginStatus,
  fillAndSendPrompt,
  startNewChat,
} = require("./common");

function parseArgs() {
  const args = process.argv.slice(2);
  let prompt = "";
  let newChat = false;
  let timeout = 120;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-p" || arg === "--prompt") {
      prompt = args[++i];
    } else if (arg === "-n" || arg === "--new-chat") {
      newChat = true;
    } else if (arg === "-t" || arg === "--timeout") {
      timeout = parseInt(args[++i], 10) || 120;
    } else if (!prompt && !arg.startsWith("-")) {
      prompt = arg;
    }
  }

  return { prompt, newChat, timeout };
}

async function main() {
  const { prompt, newChat, timeout } = parseArgs();

  if (!prompt) {
    console.error("使用方法: node ask_text.js --prompt \"你的问题或指令\" [--new-chat]");
    process.exit(1);
  }

  try {
    console.log("[1/4] 连接浏览器...");
    const browser = await connectBrowser({ autoLaunch: true });
    const page = await getChatGPTPage(browser);

    console.log("[2/4] 检查登录状态...");
    const status = await checkLoginStatus(page);
    if (!status.loggedIn) {
      console.error(`[✗ 错误] ${status.message}`);
      process.exit(1);
    }

    if (newChat) {
      console.log("[3/4] 开启新会话...");
      await startNewChat(page);
    }

    console.log(`[4/4] 发送文本提示词: "${prompt}"`);
    await fillAndSendPrompt(page, prompt);

    console.log("正在等待 ChatGPT 回答...");
    const startTime = Date.now();
    const maxWaitMs = timeout * 1000;
    let hadStopButton = false;

    while (Date.now() - startTime < maxWaitMs) {
      await page.waitForTimeout(1500);

      const stopBtn = page.locator('button[data-testid="stop-button"], button[aria-label="停止生成"], button[aria-label="Stop streaming"]').first();
      const isStopVisible = await stopBtn.isVisible().catch(() => false);

      if (isStopVisible) {
        hadStopButton = true;
      }

      if (hadStopButton && !isStopVisible) {
        await page.waitForTimeout(1000);
        break;
      }

      if (!hadStopButton && Date.now() - startTime > 8000) {
        const lastMsg = await page.locator('div[data-message-author-role="assistant"]').last();
        if (await lastMsg.isVisible().catch(() => false)) {
          break;
        }
      }
    }

    const lastAssistantMessage = await page
      .locator('div[data-message-author-role="assistant"]')
      .last()
      .innerText()
      .catch(() => "");


    console.log("\n================ [ChatGPT 回复] ================\n");
    console.log(lastAssistantMessage || "(无回复内容)");
    console.log("\n================================================\n");
  } catch (err) {
    console.error(`\n[✗ 执行异常]: ${err.message}`);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();

