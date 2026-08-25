---
name: chatgpt-browser-imagegen
description: Control a local Chrome or Edge browser logged into ChatGPT (chatgpt.com) via Chrome DevTools Protocol (CDP port 9222) to generate images (DALL-E / GPT-4o image generation), download high-resolution outputs, and perform text dialogue. Features persistent profile retention, anti-detection flags, auto-browser launch, and session token persistence so accounts never log out.
---

# ChatGPT Browser Image Generator (v2.0)

Control a local Chrome/Edge browser with **persistent profile and permanent login retention** to generate high-resolution images, perform image-to-image (I2I / Ref2I) re-draws, or query ChatGPT web directly.

## Key Upgrades in v2.0
- **Permanent Account Memory**: Dedicated persistent browser profile (`~/.codex/browser_chatgpt_profile`) + automated session state backup (`session_state.json`), ensuring accounts never get logged out.
- **Anti-Automation Detection**: Injects stealth flags (`--disable-blink-features=AutomationControlled`, webdriver bypass) to prevent Cloudflare Turnstile and Google OAuth security blocks.
- **Auto-Launch on Demand**: When issuing a generation command, the script automatically verifies and launches the browser if port 9222 is not yet active.
- **High-Resolution Estuary Capture**: Intercepts ChatGPT's internal full-resolution image streams and Estuary endpoints without lossy compression.

## Quick CLI Usage

All commands can be executed via `cli.js`:

### 1. Check Status & Account Health
```powershell
node <skill-path>/scripts/cli.js status
```
Outputs:
- Debugging port status (9222)
- Profile path and session persistence file
- Current ChatGPT account name & subscription tier (Plus/Pro/Team/Free)

### 2. Login & Permanently Remember Account
If running for the first time or setting up a new account:
```powershell
node <skill-path>/scripts/cli.js login
```
Opens ChatGPT in the dedicated browser window, waits for login completion, and immediately saves all session cookies to permanent storage.

### 3. Generate or Re-draw Images
```powershell
# Text to Image (T2I)
node <skill-path>/scripts/cli.js generate `
  --prompt "电影级场景概念图：繁华赛博朋克夜市，霓虹雨夜，8K超清画质" `
  --aspect "16:9" `
  --output "<workspace-path>/output_images/cyberpunk_city.png"

# Image to Image / Reference (I2I / Ref2I)
node <skill-path>/scripts/cli.js generate `
  --prompt "参考上传的图片，保持主体人物构图不变，重绘为极高质量的电影级光影" `
  --image "<path-to-ref1.png>,<path-to-ref2.png>" `
  --output "<workspace-path>/output_images/remake.png"
```

Parameters:
- `--prompt` / `-p`: Image generation prompt.
- `--image` / `-i` / `--ref`: Single or comma-separated list of reference image paths.
- `--output` / `-o`: Output image file path or destination directory.
- `--aspect` / `-a`: Target aspect ratio (e.g. `16:9`, `9:16`, `1:1`, `4:3`).
- `--new-chat` / `-n`: Open a fresh conversation context.
- `--timeout` / `-t`: Timeout in seconds (default 180).

### 4. Text Dialogue & Testing
```powershell
node <skill-path>/scripts/cli.js ask --prompt "请以导演视角分析这段分镜的视觉构图重点"
```

### 5. Batch Generation
```powershell
node <skill-path>/scripts/cli.js batch --file "tasks.json" --output "./output_images/batch"
```

## Troubleshooting & Best Practices
- **Never Logged Out**: Session cookies are automatically refreshed and written to `session_state.json` on every successful action.
- **Port Conflict**: Default port is `9222`. Can be customized via environment variable `CHATGPT_CDP_PORT`.
- **Browser Choice**: Supports Chrome, Edge, and Brave. Specify `--chrome` or `--edge` if needed.
