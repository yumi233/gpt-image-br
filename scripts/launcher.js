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
 * 隐藏后台浏览器的桌面窗口与任务栏图标 (SW_HIDE)
 */
function hideBrowserWindowOnWindows(port = CDP_PORT) {
  if (process.platform !== "win32") return;

  const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
Start-Sleep -Milliseconds 800
$conns = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue
if ($conns) {
    $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pidNum in $pids) {
        $p = Get-Process -Id $pidNum -ErrorAction SilentlyContinue
        if ($p -and $p.MainWindowHandle -ne 0) {
            [Win32]::ShowWindow($p.MainWindowHandle, 0)
        }
    }
}
`;
  exec(`powershell -NoProfile -NonInteractive -Command "${psScript.replace(/"/g, '\\"')}"`);
}

/**
 * 启动浏览器（支持 0 任务栏图标的无感静默后台模式）
 */
async function launchBrowser(options = {}) {
  const browserType = options.browserType || null;
  const profileDir = options.profileDir || PROFILE_DIR;
  const port = options.port || CDP_PORT;
  const targetUrl = options.targetUrl || CHATGPT_URL;
  const waitReady = options.waitReady !== false;
  const silent = options.visible ? false : (options.silent !== false);

  const browserInfo = findBrowserExecutable(browserType);
  if (!browserInfo) {
    throw new Error("未能在常见系统路径中找到 Chrome、Edge 或 Brave 浏览器，请检查浏览器安装。");
  }

  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  const modeText = silent ? "无感静默后台模式 (0 任务栏图标)" : "可视桌面窗口模式";
  console.log(`[启动器] 选用浏览器: ${browserInfo.name} (${modeText})`);
  console.log(`[启动器] 专属持久化 Profile 目录: ${profileDir}`);
  console.log(`[启动器] 调试端口: ${port}`);

  const chromeArgs = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--profile-directory=Default",
    "--disable-blink-features=AutomationControlled",
    "--no-first-run",
    "--no-default-browser-check",
    "--restore-last-session"
  ];

  if (silent) {
    chromeArgs.push("--window-position=-32000,-32000", "--window-size=1920,1080");
  } else {
    chromeArgs.push("--start-maximized");
  }

  chromeArgs.push(targetUrl);

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
        if (silent) {
          hideBrowserWindowOnWindows(port);
        }
        return { success: true, browser: browserInfo, profileDir, port, silent };
      }
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  if (silent) {
    hideBrowserWindowOnWindows(port);
  }

  return { success: true, browser: browserInfo, profileDir, port, silent };
}

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
  ensureBrowserRunning,
  hideBrowserWindowOnWindows
};
