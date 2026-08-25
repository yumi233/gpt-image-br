const net = require("net");
const { spawn, exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  PROFILE_DIR,
  CDP_PORT,
  CHATGPT_URL,
  findBrowserExecutable
} = require("./config");

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
 * 启动浏览器实例
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

  console.log(`[启动器] 选用浏览器: ${browserInfo.name}`);
  console.log(`[启动器] 专属持久化 Profile 目录: ${profileDir}`);
  console.log(`[启动器] 调试端口: ${port}`);

  const chromeArgs = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--profile-directory=Default",
    "--disable-blink-features=AutomationControlled",
    "--no-first-run",
    "--no-default-browser-check",
    "--restore-last-session",
    targetUrl
  ];

  const psArgList = chromeArgs.map((a) => `"${a}"`).join(", ");
  const psCmd = `Start-Process "${browserInfo.path}" -ArgumentList @(${psArgList}) -PassThru | Out-Null`;

  spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCmd], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  }).unref();

  if (waitReady) {
    const maxWait = 20000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const open = await isPortListening(port);
      if (open) {
        return { success: true, browser: browserInfo, profileDir, port, spawned: true };
      }
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  return { success: true, browser: browserInfo, profileDir, port, spawned: true };
}

/**
 * 确保浏览器正在运行（若未启动则按需启动）
 */
async function ensureBrowserRunning(options = {}) {
  const port = options.port || CDP_PORT;
  const isListening = await isPortListening(port);

  if (isListening) {
    return { alreadyRunning: true, port, spawned: false };
  }

  console.log(`[启动器] 正在按需唤起专属浏览器...`);
  return await launchBrowser(options);
}

/**
 * 任务完成后彻底关闭后台调试浏览器，清除任务栏多余图标
 */
async function closeBrowser(port = CDP_PORT) {
  if (process.platform === "win32") {
    const psCmd = `$conns = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue; if ($conns) { $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($p in $pids) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } }`;
    exec(`powershell -NoProfile -NonInteractive -Command "${psCmd.replace(/"/g, '\\"')}"`);
  }
}

module.exports = {
  isPortListening,
  launchBrowser,
  ensureBrowserRunning,
  closeBrowser
};
