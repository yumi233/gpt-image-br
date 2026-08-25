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
  batch: "batch_generate.js",
  launch: "launch_helper.js"
};

function printHelp() {
  console.log(`
==========================================================
        ChatGPT 浏览器生图与自动化工具 (CLI)
==========================================================

用法: node cli.js <命令> [参数...]

核心命令:
  login                      启动专属浏览器并辅助完成永久登录与会话保存
  status                     检测当前浏览器调试端口、Profile 及 ChatGPT 登录状态
  launch [--edge|--chrome]   启动专属持久化浏览器窗口 (Port: 9222)
  generate -p "提示词"       生成/修改图像并自动保存至本地
      [-i "参考图1,参考图2"]    传入单张或多张参考图 (图生图/重绘)
      [-o "输出路径"]          指定保存路径或目录
      [-n]                     开启全新对话
      [-a "16:9|9:16|1:1"]     指定生成画幅比例
  ask -p "问题/指令"         在 ChatGPT 网页中进行文本提问与对话
  batch -f <tasks.json>      批量执行生图任务列表

特性:
  ✓ 专属持久化 Profile: 登录一次永久保存，绝不掉登录态
  ✓ 防反爬/反自动化特征注入: 解决 Google/Cloudflare 拦截
  ✓ 智能高分辨率提取: 自动截获 ChatGPT 内部 Estuary 原图
  ✓ 自动化守护: 调试端口未启动时自动拉起浏览器
`);
}

if (command === "help" || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

if (command === "launch") {
  const { launchBrowser } = require("./launcher");
  const browserType = remainingArgs.includes("--edge") ? "edge" : remainingArgs.includes("--chrome") ? "chrome" : null;\n  const visible = remainingArgs.includes("--visible");\n  launchBrowser({ browserType, visible })
  
    console.log("[✓] 浏览器已在后台启动！");
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

