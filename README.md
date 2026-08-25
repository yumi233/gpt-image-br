# GPT图像 (ChatGPT Browser Image Generator)

基于 Chrome DevTools Protocol (CDP) 与持久化浏览器会话的 **ChatGPT 网页端图像生成与自动化工具**。

支持直接驱动本地已登录的 Chrome / Edge 浏览器，进行**高清文生图 (T2I)**、**图生图/多图参考重绘 (I2I/Ref2I)**、**文本指令交互**与**批量出图任务**。

---

## ✨ 核心特性

- 🔒 **永久记住账号**：采用独立专属持久化 Profile（`~/.codex/browser_chatgpt_profile`）+ `session_state.json` 双重状态备份机制，**一次登录，永久有效**，彻底解决掉登录态问题。
- 🛡️ **防反爬与反自动化检测**：注入反检测参数（`--disable-blink-features=AutomationControlled`、消除 `navigator.webdriver`），完美支持 Google 登录、微软 SSO 以及顺畅通过 Cloudflare 人机验证。
- 🎨 **原图级高清提取**：底层拦截 ChatGPT 内部 Estuary / DALL-E 高清图像流与原图 Blob，无损保存至本地，杜绝前端压缩损耗。
- 🖼️ **支持图生图 (I2I / Ref2I)**：支持一键上传单张或多张参考图片，自动完成缩略图就绪监听并进行重绘与微调。
- ⚡ **守护进程自启动**：运行生图指令时，若检测到调试端口（9222）未开启，脚本将自动在后台唤起浏览器，无需手动操作。
- 💻 **一体化 CLI 工具**：提供统一的 `cli.js` 命令行入口，支持登录、状态诊断、生图、文本交互与批量任务。
- 🤖 **原生 Skill 支持**：可作为 Codex / Claude / Cursor 的系统级 Skill 直接调用。

---

## 🚀 快速上手

### 1. 安装依赖

需要 Node.js (v18+) 环境：

```bash
git clone https://github.com/yumi233/gpt-image-br.git
cd gpt-image-br
npm install
```

### 2. 首次登录（仅需一次）

运行登录助手启动专属浏览器：

```bash
npm run login
# 或者
node scripts/cli.js login
```

浏览器打开后，在页面中登录你的 ChatGPT 账号。登录成功后，脚本会自动检测并把 Cookies 和会话状态备份到持久化文件中。

### 3. 环境自检与状态诊断

```bash
npm run status
# 或者
node scripts/cli.js status
```

---

## 📖 CLI 命令行指南

### 1. 文生图 (Text to Image)

```bash
node scripts/cli.js generate \
  --prompt "电影级场景概念图：繁华赛博朋克夜市，霓虹雨夜，8K超清画质" \
  --aspect "16:9" \
  --output "output_images/cyberpunk.png"
```

### 2. 图生图 / 参考图重绘 (Image to Image)

```bash
# 单张参考图
node scripts/cli.js generate \
  --prompt "参考上传的图片，保持主体人物构图不变，重绘为极高质量的电影级光影" \
  --image "path/to/ref.png" \
  --output "output_images/remake.png"

# 多张参考图（逗号分隔）
node scripts/cli.js generate \
  --prompt "结合图1的角色与图2的场景风格进行融合创作" \
  --image "char.png,scene.png" \
  --output "output_images/fusion.png"
```

### 3. 文本交互与对话测试

```bash
node scripts/cli.js ask --prompt "请以导演视角分析这段分镜的视觉构图重点"
```

### 4. 批量生图任务

编写任务文件 `tasks.json`：

```json
[
  {
    "name": "场景01_暴雨夜工作室",
    "prompt": "现代建筑模型工作室，落地窗外暴雨如注，冷暖光影强烈对比，8K超清",
    "aspect": "16:9",
    "file": "scene_01.png"
  },
  {
    "name": "场景02_太古洪钟",
    "prompt": "巍峨险峻仙山云海之间，静静悬浮着一座遮天蔽日的远古青铜巨钟",
    "aspect": "16:9",
    "file": "scene_02.png"
  }
]
```

执行批量生成：

```bash
node scripts/cli.js batch --file tasks.json --output ./output_images/batch
```

---

## 🛠️ 参数说明

| 参数 | 简写 | 说明 | 默认值 |
| :--- | :--- | :--- | :--- |
| `--prompt` | `-p` | 生图或提问的提示词指令 | - |
| `--image` | `-i` / `--ref` | 参考图路径（支持单张或逗号分隔多张） | - |
| `--output` | `-o` | 输出文件路径或目标目录 | `./output_images` |
| `--aspect` | `-a` | 目标画幅比例（如 `16:9`, `9:16`, `1:1`） | - |
| `--new-chat`| `-n` | 在生成前开启全新会话 | `false` |
| `--timeout` | `-t` | 最长等待生成时间（秒） | `180` |

---

## 📁 目录结构

```text
gpt-image/
├── scripts/
│   ├── cli.js               # 统一命令行入口
│   ├── config.js            # 路径与端口统一配置文件
│   ├── launcher.js          # 浏览器唤起与端口检测模块
│   ├── session.js           # 会话持久化与 Cookies 备份恢复
│   ├── common.js            # CDP 核心通信、DOM 选择器与防检测注入
│   ├── generate_image.js    # 图像生成与 Estuary 高清提取
│   ├── ask_text.js          # 文本交互对话
│   ├── check_status.js      # 状态自检与诊断
│   ├── login.js             # 一键永久登录助手
│   ├── batch_generate.js    # 批量生图执行器
│   ├── launch_browser.bat   # Windows 快捷启动脚本
│   └── launch_browser.ps1   # PowerShell 快捷启动脚本
├── agents/
│   └── openai.yaml          # Codex / OpenAI Agent 规范
├── SKILL.md                 # Codex Skill 定义文档
├── package.json             # 项目元数据与依赖配置
├── .gitignore               # Git 忽略配置
└── README.md                # 项目中文说明文档
```

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。

