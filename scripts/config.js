const path = require("path");
const fs = require("fs");
const os = require("os");

const userHome = process.env.USERPROFILE || process.env.HOME || os.homedir() || "C:\\Users\\YUMI";

// 标准持久化配置目录
let defaultProfileDir = path.join(userHome, ".codex", "browser_chatgpt_profile");

// 兼容旧环境配置（如已在 E 盘存在 profile）
if (!fs.existsSync(defaultProfileDir) && fs.existsSync("E:\\MiniMax h3\\browser_chatgpt\\chrome_profile")) {
  defaultProfileDir = "E:\\MiniMax h3\\browser_chatgpt\\chrome_profile";
}

const PROFILE_DIR = process.env.CHATGPT_PROFILE_DIR || defaultProfileDir;
const SESSION_STATE_FILE = path.join(PROFILE_DIR, "session_state.json");

const CDP_PORT = parseInt(process.env.CHATGPT_CDP_PORT, 10) || 9222;
const CDP_URL = process.env.CHROME_CDP_URL || process.env.CHATGPT_CDP_URL || `http://127.0.0.1:${CDP_PORT}`;

const CHATGPT_URL = process.env.CHATGPT_URL || "https://chatgpt.com/";

const BROWSER_CANDIDATES = [
  {
    name: "Google Chrome",
    type: "chrome",
    paths: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe")
    ]
  },
  {
    name: "Microsoft Edge",
    type: "edge",
    paths: [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      path.join(process.env.LOCALAPPDATA || "", "Microsoft\\Edge\\Application\\msedge.exe")
    ]
  },
  {
    name: "Brave Browser",
    type: "brave",
    paths: [
      "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
      path.join(process.env.LOCALAPPDATA || "", "BraveSoftware\\Brave-Browser\\Application\\brave.exe")
    ]
  }
];

function findBrowserExecutable(preferredType) {
  let list = BROWSER_CANDIDATES;
  if (preferredType) {
    list = BROWSER_CANDIDATES.filter((b) => b.type === preferredType.toLowerCase()).concat(
      BROWSER_CANDIDATES.filter((b) => b.type !== preferredType.toLowerCase())
    );
  }

  for (const candidate of list) {
    for (const p of candidate.paths) {
      if (p && fs.existsSync(p)) {
        return { name: candidate.name, type: candidate.type, path: p };
      }
    }
  }
  return null;
}

module.exports = {
  PROFILE_DIR,
  SESSION_STATE_FILE,
  CDP_PORT,
  CDP_URL,
  CHATGPT_URL,
  BROWSER_CANDIDATES,
  findBrowserExecutable
};
