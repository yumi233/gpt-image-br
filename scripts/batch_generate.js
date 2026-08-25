const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function parseArgs() {
  const args = process.argv.slice(2);
  let taskFile = "";
  let outDir = "./output_images/batch";
  let delay = 3; // 任务间隔秒数

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-f" || arg === "--file" || arg === "--tasks") {
      taskFile = args[++i];
    } else if (arg === "-o" || arg === "--output") {
      outDir = args[++i];
    } else if (arg === "-d" || arg === "--delay") {
      delay = parseInt(args[++i], 10) || 3;
    }
  }

  return { taskFile, outDir, delay };
}

async function main() {
  const { taskFile, outDir, delay } = parseArgs();

  if (!taskFile) {
    console.log("使用方法: node batch_generate.js --file <tasks.json|tasks.js> [--output <输出目录>] [--delay <秒>]");
    console.log("任务文件格式支持 JSON 数组: [ { \"prompt\": \"...\", \"file\": \"out.png\", \"image\": \"ref.png\" }, ... ]");
    process.exit(1);
  }

  const resolvedTaskFile = path.resolve(process.cwd(), taskFile);
  if (!fs.existsSync(resolvedTaskFile)) {
    console.error(`[错误] 任务文件不存在: ${resolvedTaskFile}`);
    process.exit(1);
  }

  let tasks = [];
  if (resolvedTaskFile.endsWith(".js")) {
    const mod = require(resolvedTaskFile);
    tasks = mod.TASKS || mod.tasks || (Array.isArray(mod) ? mod : []);
  } else {
    const content = fs.readFileSync(resolvedTaskFile, "utf-8");
    tasks = JSON.parse(content);
  }

  if (!Array.isArray(tasks) || tasks.length === 0) {
    console.error("[错误] 任务列表为空或格式不正确。");
    process.exit(1);
  }

  const resolvedOutDir = path.resolve(process.cwd(), outDir);
  fs.mkdirSync(resolvedOutDir, { recursive: true });

  console.log("==================================================");
  console.log(`        开始执行批量图像生成任务 (共 ${tasks.length} 项)        `);
  console.log(` 输出目录: ${resolvedOutDir}`);
  console.log("==================================================");

  const results = [];
  const genScript = path.resolve(__dirname, "generate_image.js");

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const taskName = task.name || `Task_${i + 1}`;
    const filename = task.file || `${taskName}.png`;
    const outputPath = path.join(resolvedOutDir, filename);

    console.log(`\n--------------------------------------------------`);
    console.log(`[${i + 1}/${tasks.length}] 正在执行: ${taskName}`);
    console.log(`提示词: ${task.prompt}`);
    if (task.image || task.images) {
      console.log(`参考图: ${task.image || task.images}`);
    }

    const cmdArgs = ["node", `"${genScript}"`, "--prompt", `"${task.prompt.replace(/"/g, '\\"')}"`, "--output", `"${outputPath}"`];

    if (task.image) {
      cmdArgs.push("--image", `"${task.image}"`);
    } else if (task.images) {
      const imgStr = Array.isArray(task.images) ? task.images.join(",") : task.images;
      cmdArgs.push("--image", `"${imgStr}"`);
    }

    if (task.newChat || i === 0) {
      cmdArgs.push("--new-chat");
    }

    if (task.aspect) {
      cmdArgs.push("--aspect", `"${task.aspect}"`);
    }

    const fullCmd = cmdArgs.join(" ");

    try {
      execSync(fullCmd, { stdio: "inherit" });
      results.push({ name: taskName, status: "success", output: outputPath });
    } catch (err) {
      console.error(`[✗ 失败] ${taskName} 生成异常: ${err.message}`);
      results.push({ name: taskName, status: "failed", error: err.message });
    }

    if (i < tasks.length - 1 && delay > 0) {
      console.log(`等待 ${delay} 秒以避免频率限制...`);
      await new Promise((r) => setTimeout(r, delay * 1000));
    }
  }

  console.log("\n==================================================");
  console.log("                批量生成任务总结                  ");
  console.log("==================================================");
  console.table(results);
}

main();
