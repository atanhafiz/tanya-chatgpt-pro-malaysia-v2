// src/handlers/commentHandler.js
import axios from "axios";
import fs from "fs-extra";
import path from "path";
import logger from "../utils/logger.js";
import { generatePrompt } from "./tonePrompt.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.ALLOWED_CHAT_IDS;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

const TEMP_DIR = path.resolve("./src/data");
const DRAFT_FILE = path.join(TEMP_DIR, "draftAnswers.json");

// =============== State Setup ===============
await fs.ensureDir(TEMP_DIR);
if (!(await fs.pathExists(DRAFT_FILE))) await fs.writeJson(DRAFT_FILE, {});

// =============== Helpers ===============
async function loadDrafts() {
  return (await fs.readJson(DRAFT_FILE).catch(() => ({}))) || {};
}
async function saveDrafts(data) {
  await fs.writeJson(DRAFT_FILE, data, { spaces: 2 });
}

async function sendTelegramMessage(text, buttons = []) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    const res = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      { chat_id: TELEGRAM_CHAT_ID, text, reply_markup: { inline_keyboard: buttons } }
    );
    logger.log("telegram", "📨 Telegram sent", { text });
    return res.data;
  } catch (e) {
    logger.log("error", "❌ Telegram send fail", { err: e.message });
  }
}

async function postToFacebook(commentId, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v21.0/${commentId}/comments?access_token=${FB_PAGE_ACCESS_TOKEN}`,
      { message: text }
    );
    return true;
  } catch (e) {
    logger.log("error", "❌ Failed to post to Facebook", { err: e.message });
    return false;
  }
}

// =============== Core Handler ===============
export async function handleNewComment(value) {
  const name = value.from?.name || "Unknown";
  const message = value.message || "(no text)";
  const postId = value.post_id;
  const commentId = value.comment_id;
  const permalinkUrl = `https://facebook.com/${postId}`;
  const entry = { postId, commentId, authorName: name, message, permalinkUrl };

  const text =
`🆕 *FB Comment Detected!*
👤 *By:* ${name}
💭 *Comment:* ${message}
🔗 *Post:* ${permalinkUrl}
🆔 *Comment ID:* ${commentId}`;

  const buttons = [
    [
      { text: "📋 Copy Prompt", callback_data: `copy:${commentId}` },
      { text: "😎 Copy Prompt – AHE Tone", callback_data: `copyahe:${commentId}` },
    ],
    [
      { text: "✅ Mark Answered", callback_data: `mark:${commentId}` },
      { text: "📤 Post to FB", callback_data: `post:${commentId}` },
    ],
  ];

  await sendTelegramMessage(text, buttons);
  logger.log("facebook", "💬 New comment handled", entry);
}

// =============== Telegram Interaction ===============
export async function handleTelegramCommand(msg) {
  const text = msg.text?.trim() || "";
  const chatId = msg.chat.id;
  if (!text.startsWith("/answer")) return;

  const lines = text.split("\n");
  const first = lines.shift();
  const body = lines.join("\n").trim();
  const parts = first.split(" ");
  if (parts.length < 2 || !body) {
    return sendTelegramMessage("❌ Format salah. Guna:\n/answer {comment_id}\n<jawapan>");
  }

  const commentId = parts[1].trim();
  const drafts = await loadDrafts();
  drafts[commentId] = body;
  await saveDrafts(drafts);

  await sendTelegramMessage(`✅ Draft saved untuk *${commentId}*\nBila ready, tekan 📤 *Post to FB*`);
  logger.log("telegram", "💾 Draft saved", { commentId });
}

export async function handleTelegramCallback(query) {
  const data = query.data;
  const [action, commentId] = data.split(":");
  const msg = query.message;

  const drafts = await loadDrafts();

  if (action === "copy" || action === "copyahe") {
    const tone = action === "copyahe" ? "ahe" : "auto";
    const entry = { commentId, postId: "unknown", authorName: "", message: msg.text };
    const prompt = generatePrompt(entry, tone);
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: prompt,
    });
    return;
  }

  if (action === "mark") {
    await sendTelegramMessage(`✅ Comment ${commentId} ditandakan sebagai dijawab.`);
    return;
  }

  if (action === "post") {
    const ans = drafts[commentId];
    if (!ans) return sendTelegramMessage(`⚠️ Tiada draft untuk ${commentId}. Guna /answer dulu.`);
    const ok = await postToFacebook(commentId, ans);
    if (ok) {
      await sendTelegramMessage(`✅ Posted to FB:\nhttps://facebook.com/${commentId}`);
      delete drafts[commentId];
      await saveDrafts(drafts);
    } else {
      await sendTelegramMessage(`❌ Gagal post ke FB untuk ${commentId}.`);
    }
  }
}
