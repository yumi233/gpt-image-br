const net = require("net");
const { exec, spawn } = require("child_process");
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
 * @param {Object} options
 * @param {boolean} options.silent - 是否静默后台运行（默认 true：窗口移出屏幕不可视，无感调用）
 */
async function launchBrowser(options = {}) {
  const browserType = options.browserType || null;
  const profileDir = options.profileDir || PROFILE_DIR;
  const port = options.port || CDP_PORT;
  const targetUrl = options.targetUrl || CHATGPT_URL;
  const waitReady = options.waitReady !== false;
  // 默认静默后台运行，除非显式指定 visible = true (如 login 流程)
  const silent = options.visible ? false : (options.silent !== false);

  const browserInfo = findBrowserExecutable(browserType);
  if (!browserInfo) {
    throw new Error("未能在常见系统路径中找到 Chrome、Edge 或 Brave 浏览器，请检查浏览器安装。");
  }

  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  const windowArgs = silent
    ? ['"--window-position=-32000,-32000"', '"--window-size=1920,1080"']
    : ['"--start-maximized"'];

  const modeText = silent ? "无感静默后台模式" : "可视窗口模式";
  console.log(`[启动器] 选用浏览器: ${browserInfo.name} (${modeText})`);
  console.log(`[启动器] 专属持久化 Profile 目录: ${profileDir}`);
  console.log(`[启动器] 调试端口: ${port}`);

  if (process.platform === "win32") {
    const argList = [
      `"--remote-debugging-port=${port}"`,
      `"--user-data-dir=${profileDir}"`,
      `"--profile-directory=Default"`,
      `"--disable-blink-features=AutomationControlled"`,
      `"--no-first-run"`,
      `"--no-default-browser-check"`,
      `"--restore-last-session"`,
      ...windowArgs,
      `"${targetUrl}"`
    ].join(", ");

    const psCmd = `Start-Process "${browserInfo.path}" -ArgumentList @(${argList})`;
    exec(`powershell -NoProfile -Command "${psCmd.replace(/"/g, '\\"')}"`);
  } else {
    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      "--profile-directory=Default",
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
      "--restore-last-session",
      ...(silent ? ["--window-position=-32000,-32000", "--window-size=1920,1080"] : ["--start-maximized"]),
      targetUrl
    ];

    const child = spawn(browserInfo.path, args, {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
  }

  if (waitReady) {
    const maxWait = 20000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const open = await isPortListening(port);
      if (open) {
        return { success: true, browser: browserInfo, profileDir, port, silent };
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return { success: true, browser: browserInfo, profileDir, port, silent };
}

/**
 * 确保浏览器正在运行（若未启动则以静默无感模式启动）
 */
async function ensureBrowserRunning(options = {}) {
  const port = options.port || CDP_PORT;
  const isListening = await isPortListening(port);

  if (isListening) {
    return { alreadyRunning: true, port };
  }

  return await launchBrowser(options);
}

module.exports = {
  isPortListening,
  launchBrowser,
  ensureBrowserRunning
};
