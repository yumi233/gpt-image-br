const net = require("net");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  PROFILE_DIR,
  CDP_PORT,
  CHATGPT_URL,
  findBrowserExecutable
} = require("./config");

/**
 * 检查指定端口是否已在监听
 */
function isPortListening(port = CDP_PORT, host = "127.0.0.1", timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isConnected = false;

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      isConnected = true;
      socket.destroy();
      resolve(true);
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

/**
 * 启动带持久化 Profile 与防检测参数的浏览器
 */
async function launchBrowser(options = {}) {
  const browserType = options.browserType || null;
  const profileDir = options.profileDir || PROFILE_DIR;
  const port = options.port || CDP_PORT;
  const targetUrl = options.targetUrl || CHATGPT_URL;
  const waitReady = options.waitReady !== false;

  const browserInfo = findBrowserExecutable(browserType);
  if (!browserInfo) {
    throw new Error("未能在常见系统路径中找到 Chrome、Edge 或 Brave 浏览器，请检查浏览器安装。");
  }

  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  console.log(`[启动器] 选用浏览器: ${browserInfo.name} (${browserInfo.path})`);
  console.log(`[启动器] 专属持久化 Profile 目录: ${profileDir}`);
  console.log(`[启动器] 调试端口: ${port}`);

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--profile-directory=Default",
    "--disable-blink-features=AutomationControlled",
    "--no-first-run",
    "--no-default-browser-check",
    "--restore-last-session",
    "--disable-infobars",
    "--password-store=basic",
    "--enable-features=NetworkService,NetworkServiceInProcess",
    "--start-maximized",
    targetUrl
  ];

  const child = spawn(browserInfo.path, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });

  child.unref();

  if (waitReady) {
    console.log("[启动器] 正在等待浏览器调试端口就绪...");
    const maxWait = 20000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const open = await isPortListening(port);
      if (open) {
        console.log(`[启动器] 调试端口 (${port}) 已成功就绪！`);
        return { success: true, browser: browserInfo, profileDir, port };
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.warn(`[启动器警告] 端口 ${port} 未能在 20 秒内响应，但浏览器进程已发起。`);
  }

  return { success: true, browser: browserInfo, profileDir, port };
}

/**
 * 确保浏览器正在运行（若未启动则自动启动）
 */
async function ensureBrowserRunning(options = {}) {
  const port = options.port || CDP_PORT;
  const isListening = await isPortListening(port);

  if (isListening) {
    return { alreadyRunning: true, port };
  }

  console.log(`[启动器] 检测到调试端口 (${port}) 未启动，正在为您自动启动浏览器...`);
  return await launchBrowser(options);
}

module.exports = {
  isPortListening,
  launchBrowser,
  ensureBrowserRunning
};
