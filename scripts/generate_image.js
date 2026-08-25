const fs = require("fs");
const path = require("path");
const {
  connectBrowser,
  getChatGPTPage,
  checkLoginStatus,
  waitForLogin,
  fillAndSendPrompt,
  startNewChat,
  saveSessionState
} = require("./common");

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {
    prompt: "",
    images: [],
    output: "",
    newChat: false,
    timeout: 240,
    aspect: "",
    autoLaunch: true
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-p" || arg === "--prompt") {
      params.prompt = args[++i];
    } else if (arg === "-i" || arg === "--image" || arg === "--ref" || arg === "--reference") {
      const val = args[++i];
      if (val) {
        if (val.includes(",")) {
          params.images.push(...val.split(",").map((s) => s.trim()));
        } else {
          params.images.push(val.trim());
        }
      }
    } else if (arg === "-o" || arg === "--output") {
      params.output = args[++i];
    } else if (arg === "-n" || arg === "--new-chat") {
      params.newChat = true;
    } else if (arg === "-a" || arg === "--aspect") {
      params.aspect = args[++i];
    } else if (arg === "-t" || arg === "--timeout") {
      params.timeout = parseInt(args[++i], 10) || 240;
    } else if (arg === "--no-auto-launch") {
      params.autoLaunch = false;
    } else if (!params.prompt && !arg.startsWith("-")) {
      params.prompt = arg;
    }
  }

  return params;
}

/**
 * 提取页面中真正由 Assistant 绘制/生成的图片
 */
async function extractGeneratedImage(page, initialImgCount = 0) {
  return await page.evaluate((initialCount) => {
    // 优先从显式标有“已生成”或“Generated”的 img 标签中提取
    const candidateImgs = Array.from(document.querySelectorAll("main img, img"));
    
    // 过滤掉头像、用户上传的缩略图
    const generated = candidateImgs.filter((img) => {
      const alt = img.alt || "";
      const isUserUpload =
        alt.endsWith(".png") ||
        alt.endsWith(".jpg") ||
        alt.endsWith(".jpeg") ||
        alt.endsWith(".webp") ||
        alt.includes("Uploaded image") ||
        alt.includes("上传的图片");

      const isAvatar =
        (img.src && (img.src.includes("avatar") || img.src.includes("profile") || img.src.includes("public_content"))) ||
        (img.className && img.className.includes("rounded-full")) ||
        alt.includes("个人资料") ||
        alt.includes("Profile");

      const isRealGenerated =
        alt.includes("已生成") ||
        alt.includes("Generated") ||
        alt.includes("Created image") ||
        alt.includes("DALL·E") ||
        img.closest('div[data-message-author-role="assistant"]') !== null ||
        (img.naturalWidth > 600 && !isUserUpload && !isAvatar);

      return !isUserUpload && !isAvatar && isRealGenerated;
    });

    if (generated.length === 0) return null;

    const targetImg = generated[generated.length - 1];
    if (!targetImg || targetImg.naturalWidth < 100) return null;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = targetImg.naturalWidth;
      canvas.height = targetImg.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(targetImg, 0, 0);
      const base64 = canvas.toDataURL("image/png").split(",")[1];

      return {
        base64,
        src: targetImg.currentSrc || targetImg.src,
        alt: targetImg.alt || "ChatGPT Generated Image",
        width: targetImg.naturalWidth,
        height: targetImg.naturalHeight
      };
    } catch {
      return {
        src: targetImg.currentSrc || targetImg.src,
        alt: targetImg.alt || "ChatGPT Generated Image",
        width: targetImg.naturalWidth,
        height: targetImg.naturalHeight,
        needScreenshot: true
      };
    }
  }, initialImgCount);
}

async function isGenerationInProgress(page) {
  return await page.evaluate(() => {
    const stopBtn = document.querySelector(
      'button[data-testid="stop-button"], button[aria-label*="Stop"], button[aria-label*="停止"]'
    );
    return !!stopBtn;
  });
}

async function main() {
  const params = parseArgs();

  if (!params.prompt && params.images.length === 0) {
    console.error("使用方法: node generate_image.js --prompt \"生图提示词\" [--image \"参考图路径\"] [--output \"输出路径\"]");
    process.exit(1);
  }

  let fullPrompt = params.prompt;
  if (!fullPrompt && params.images.length > 0) {
    fullPrompt = "请参考我上传的参考图片，严格保持人物/主体特征与核心构图，生成一张超高清细节与电影级质感的概念图。";
  }

  if (params.aspect) {
    fullPrompt = `[画幅比例: ${params.aspect}] ${fullPrompt}`;
  }

  let browser;
  try {
    console.log(`[1/6] 正在连接/启动浏览器...`);
    browser = await connectBrowser({ autoLaunch: params.autoLaunch });
    const page = await getChatGPTPage(browser);

    console.log(`[2/6] 校验账号登录态...`);
    let status = await checkLoginStatus(page);
    if (!status.loggedIn) {
      console.log(`\n[提示] ${status.message}`);
      console.log("[自动等待] 请在打开的浏览器中完成验证/登录，完成后将自动继续生图并永久记录会话...");
      status = await waitForLogin(page, 180000);
    }

    console.log(`[✓] 账号就绪: ${status.user || "已登录"} (${status.plan || "ChatGPT"})`);

    if (params.newChat) {
      console.log(`[3/6] 正在开启新会话...`);
      await startNewChat(page);
    }

    if (params.images.length > 0) {
      console.log(`[4/6] 上传 ${params.images.length} 张参考图并发送提示词: "${fullPrompt}"`);
    } else {
      console.log(`[4/6] 发送生图指令: "${fullPrompt}"`);
    }

    await fillAndSendPrompt(page, fullPrompt, params.images);

    console.log(`[5/6] 正在生成图像，持续监听直至出图完成（最长等待 ${params.timeout} 秒）...`);
    const startTime = Date.now();
    const maxWaitMs = params.timeout * 1000;
    let hadGeneratingState = false;
    let finalImageData = null;

    while (Date.now() - startTime < maxWaitMs) {
      await page.waitForTimeout(2500);

      const inProgress = await isGenerationInProgress(page);
      if (inProgress) {
        hadGeneratingState = true;
      }

      const imgResult = await extractGeneratedImage(page);
      if (imgResult && imgResult.width > 400) {
        finalImageData = imgResult;
      }

      // 当且仅当：生成已结束（stop 消失），且已经捕获到高分辨率结果图
      if (hadGeneratingState && !inProgress && finalImageData) {
        // 再额外等待 1.5 秒让图片完全渲染到位
        await page.waitForTimeout(1500);
        finalImageData = await extractGeneratedImage(page);
        break;
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      process.stdout.write(`\r[生成中] 已等待 ${elapsed}s (服务器运算中: ${inProgress ? "是" : "否"}, 检测到高清图: ${finalImageData ? "是" : "否"})...`);
    }

    console.log("\n");

    if (!finalImageData) {
      const lastAssistantMessage = await page
        .locator('div[data-message-author-role="assistant"]')
        .last()
        .innerText()
        .catch(() => "");

      console.error("[提示] 未能捕获到新生成的图像。ChatGPT 最新回复:");
      console.error(lastAssistantMessage || "(无文本输出，可能是网络延迟或生图频率受限)");
      process.exit(2);
    }

    const cwd = process.cwd();
    let finalFilePath;

    if (params.output) {
      const resolved = path.isAbsolute(params.output) ? params.output : path.resolve(cwd, params.output);
      if (resolved.toLowerCase().endsWith(".png") || resolved.toLowerCase().endsWith(".jpg") || resolved.toLowerCase().endsWith(".webp")) {
        finalFilePath = resolved;
      } else {
        fs.mkdirSync(resolved, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
        finalFilePath = path.join(resolved, `chatgpt_gen_${ts}.png`);
      }
    } else {
      const outDir = path.resolve(cwd, "output_images");
      fs.mkdirSync(outDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
      finalFilePath = path.join(outDir, `chatgpt_gen_${ts}.png`);
    }

    fs.mkdirSync(path.dirname(finalFilePath), { recursive: true });

    console.log(`[6/6] 正在以无损原始分辨率导出保存至: ${finalFilePath}`);

    if (finalImageData.base64) {
      const buffer = Buffer.from(finalImageData.base64, "base64");
      fs.writeFileSync(finalFilePath, buffer);
    } else {
      const imgLocator = page.locator(`img[alt*="已生成"], img[alt*="Generated"]`).last();
      await imgLocator.screenshot({ path: finalFilePath });
    }

    const stats = fs.statSync(finalFilePath);
    console.log(`[✓] 图像保存成功！尺寸: ${finalImageData.width}x${finalImageData.height}，大小: ${(stats.size / 1024).toFixed(1)} KB`);

    await saveSessionState(page.context());

    const accompanyingText = await page
      .locator('div[data-message-author-role="assistant"]')
      .last()
      .innerText()
      .catch(() => "");

    const resultInfo = {
      success: true,
      imagePath: finalFilePath,
      title: finalImageData.alt,
      dimensions: `${finalImageData.width}x${finalImageData.height}`,
      fileSizeKb: (stats.size / 1024).toFixed(1),
      text: accompanyingText,
      prompt: fullPrompt,
      referenceImages: params.images
    };

    console.log("\n==================================================");
    console.log(" [✓ 成功] ChatGPT 网页生图完成！");
    console.log(` 文件路径: ${finalFilePath}`);
    console.log("==================================================");
    console.log(JSON.stringify(resultInfo, null, 2));
  } catch (err) {
    console.error(`\n[✗ 执行异常]: ${err.message}`);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();
