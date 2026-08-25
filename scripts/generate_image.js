const fs = require("fs");
const path = require("path");
const {
  connectBrowser,
  getChatGPTPage,
  checkLoginStatus,
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
    timeout: 180,
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
      params.timeout = parseInt(args[++i], 10) || 180;
    } else if (arg === "--no-auto-launch") {
      params.autoLaunch = false;
    } else if (!params.prompt && !arg.startsWith("-")) {
      params.prompt = arg;
    }
  }

  return params;
}

async function getGeneratedImages(page) {
  return await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("main img, div[data-message-author-role='assistant'] img"));
    const generated = imgs.filter((img) => {
      const alt = img.alt || "";
      const isUserThumbnail =
        alt.endsWith(".png") ||
        alt.endsWith(".jpg") ||
        alt.endsWith(".jpeg") ||
        alt.endsWith(".webp") ||
        alt.includes("Uploaded image") ||
        alt.includes("上传的图片");

      const isAvatar =
        (img.src && (img.src.includes("avatar") || img.src.includes("profile"))) ||
        (img.className && img.className.includes("rounded-full"));

      const isGenerated =
        alt.includes("已生成") ||
        alt.includes("Generated") ||
        alt.includes("Created image") ||
        alt.includes("DALL·E") ||
        (img.src && (img.src.includes("estuary/content") || img.src.includes("oaiusercontent.com") || img.src.includes("files.oaiusercontent.com"))) ||
        img.naturalWidth > 400;

      return !isUserThumbnail && !isAvatar && isGenerated;
    });

    return generated.map((img) => img.currentSrc || img.src).filter(Boolean);
  });
}

async function downloadImageFromBrowser(page, imgSrc, outputPath) {
  try {
    const base64Data = await page.evaluate(async (src) => {
      const response = await fetch(src, { credentials: "include" });
      if (!response.ok) {
        throw new Error(`Fetch status ${response.status}: ${response.statusText}`);
      }
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }, imgSrc);

    const buffer = Buffer.from(base64Data, "base64");
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  } catch (err) {
    console.warn(`[下载备用方案] 直接 Fetch 图片失败 (${err.message})，尝试 DOM 截图提取...`);
    const imgLocator = page.locator(`img[src="${imgSrc}"], img[currentSrc="${imgSrc}"]`).last();
    if (await imgLocator.isVisible({ timeout: 3000 }).catch(() => false)) {
      await imgLocator.screenshot({ path: outputPath });
      return outputPath;
    }
    throw err;
  }
}

async function main() {
  const params = parseArgs();

  if (!params.prompt && params.images.length === 0) {
    console.error("使用方法: node generate_image.js --prompt \"生图提示词\" [--image \"参考图路径\"] [--output \"输出路径\"]");
    process.exit(1);
  }

  // 构造完整提示词
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
    const status = await checkLoginStatus(page);
    if (!status.loggedIn) {
      console.error(`\n[✗ 错误] ${status.message}`);
      console.error(`[提示] 请运行 "node cli.js login" 在浏览器中登录账号，登录后将永久保存。`);
      process.exit(1);
    }

    console.log(`[✓] 账号就绪: ${status.user || "已登录"} (${status.plan || "ChatGPT"})`);

    if (params.newChat) {
      console.log(`[3/6] 正在开启新会话...`);
      await startNewChat(page);
    }

    console.log(`[4/6] 记录当前已有图片...`);
    const existingImages = await getGeneratedImages(page);

    // 监听网络响应以捕获最新的生成图 URL
    const interceptedUrls = [];
    const responseHandler = (response) => {
      const url = response.url();
      if (
        url.includes("estuary/content") ||
        url.includes("files.oaiusercontent.com") ||
        (url.includes("blob:") && response.request().resourceType() === "image")
      ) {
        if (response.status() === 200) {
          interceptedUrls.push(url);
        }
      }
    };
    page.on("response", responseHandler);

    if (params.images.length > 0) {
      console.log(`[5/6] 上传 ${params.images.length} 张参考图并发送提示词: "${fullPrompt}"`);
    } else {
      console.log(`[5/6] 发送生图指令: "${fullPrompt}"`);
    }

    await fillAndSendPrompt(page, fullPrompt, params.images);

    console.log(`[6/6] 正在生成图像，最长等待 ${params.timeout} 秒...`);
    const startTime = Date.now();
    const maxWaitMs = params.timeout * 1000;
    let newImgSrc = null;
    let hadStopButton = false;

    while (Date.now() - startTime < maxWaitMs) {
      await page.waitForTimeout(2000);

      const stopBtn = page.locator(
        'button[data-testid="stop-button"], button[aria-label="停止生成"], button[aria-label="Stop streaming"], button[aria-label="Stop generating"]'
      ).first();

      const isStopVisible = await stopBtn.isVisible().catch(() => false);
      if (isStopVisible) {
        hadStopButton = true;
      }

      const currentImages = await getGeneratedImages(page);
      const diffImages = currentImages.filter((src) => !existingImages.includes(src));

      if (diffImages.length > 0) {
        newImgSrc = diffImages[diffImages.length - 1];
      }

      if (hadStopButton && !isStopVisible && newImgSrc) {
        // 生成结束并捕获到图片
        await page.waitForTimeout(1500);
        break;
      } else if (!hadStopButton && newImgSrc && Date.now() - startTime > 12000) {
        await page.waitForTimeout(2000);
        break;
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      process.stdout.write(`\r[生成中] 已等待 ${elapsed}s (已捕获图像: ${newImgSrc ? "是" : "否"})...`);
    }

    page.off("response", responseHandler);
    console.log("\n");

    if (!newImgSrc && interceptedUrls.length > 0) {
      newImgSrc = interceptedUrls[interceptedUrls.length - 1];
    }

    if (!newImgSrc) {
      const lastAssistantMessage = await page
        .locator('div[data-message-author-role="assistant"]')
        .last()
        .innerText()
        .catch(() => "");

      console.error("[提示] 未能捕获到新生成的图像。ChatGPT 最新回复:");
      console.error(lastAssistantMessage || "(无文本输出，可能是网络延迟或生图频率受限)");
      process.exit(2);
    }

    // 处理输出文件路径
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

    console.log(`[下载] 正在提取高清图像并保存至: ${finalFilePath}`);
    await downloadImageFromBrowser(page, newImgSrc, finalFilePath);

    const stats = fs.statSync(finalFilePath);
    console.log(`[✓] 图像保存成功！大小: ${(stats.size / 1024).toFixed(1)} KB`);

    // 自动刷新保存最新会话状态
    await saveSessionState(page.context());

    const accompanyingText = await page
      .locator('div[data-message-author-role="assistant"]')
      .last()
      .innerText()
      .catch(() => "");

    const resultInfo = {
      success: true,
      imagePath: finalFilePath,
      imageUrl: newImgSrc,
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
