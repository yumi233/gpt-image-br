#!/usr/bin/env node
const path = require("path");
const { spawn } = require("child_process");

const command = process.argv[2] || "help";
const remainingArgs = process.argv.slice(3);

const scriptMap = {
  status: "check_status.js",
  check: "check_status.js",
  login: "login.js",
  auth: "login.js",
  generate: "generate_image.js",
  image: "generate_image.js",
  gen: "generate_image.js",
  ask: "ask_text.js",
  chat: "ask_text.js",
  batch: "batch_generate.js"
};

function printHelp() {
  console.log(`
==========================================================
        ChatGPT 浏览器生图与自动化工具 (CLI)
==========================================================

用法: node cli.js <命令> [参数...]

核心命令:
  login                      启动专属浏览器并辅助完成登录 (可视窗口模式)
  status                     检测当前浏览器调试端口、Profile 及 ChatGPT 账号状态
  launch [--edge|--chrome]   启动后台无感专属浏览器窗口 (Port: 9222)
      [--visible]              强制以桌面可视窗口模式启动
  generate -p "提示词"       生成/修改图像并自动保存至本地 (全自动后台无感运行)
      [-i "参考图1,参考图2"]    传入单张或多张参考图 (图生图/重绘)
      [-o "输出路径"]          指定保存路径或目录
      [-n]                     开启全新对话
      [-a "16:9|9:16|1:1"]     指定生成画幅比例
  ask -p "问题/指令"         在 ChatGPT 网页中进行文本提问与对话
  batch -f <tasks.json>      批量执行生图任务列表

特性:
  ✓ 默认无感后台静默运行: 用户界面不弹窗，体验等同原生 API
  ✓ 专属持久化 Profile: 登录一次永久保存，关闭再开不掉登录态
  ✓ 防反爬/反自动化特征注入: 解决 Google/Cloudflare 拦截
  ✓ Canvas 原画无损提取: 毫秒级提取 8K/高清原图
`);
}

if (command === "help" || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

if (command === "launch") {
  const { launchBrowser } = require("./launcher");
  const browserType = remainingArgs.includes("--edge") ? "edge" : remainingArgs.includes("--chrome") ? "chrome" : null;
  const visible = remainingArgs.includes("--visible");
  launchBrowser({ browserType, visible }).then(() => {
    console.log(visible ? "[✓] 浏览器已在桌面窗口启动！" : "[✓] 浏览器已在后台无感静默模式启动！");
  }).catch((err) => {
    console.error(`[✗] 启动失败: ${err.message}`);
  });
} else if (scriptMap[command]) {
  const targetScript = path.resolve(__dirname, scriptMap[command]);
  const child = spawn(process.execPath, [targetScript, ...remainingArgs], {
    stdio: "inherit",
    cwd: process.cwd()
  });

  child.on("exit", (code) => {
    process.exit(code || 0);
  });
} else {
  console.error(`未知命令: "${command}"\n`);
  printHelp();
  process.exit(1);
}
