import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import axios from "axios";
import TelegramBot from "node-telegram-bot-api";
import cors from "cors";
import fs from "fs-extra";
import path from "path";

dotenv.config();

const {
  PORT,
  NODE_ENV,
  PUBLIC_BASE_URL,
  FB_PAGE_ID,
  FB_APP_SECRET,
  FB_PAGE_TOKEN,
  FB_VERIFY_TOKEN,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_TOKEN,
  ALLOWED_CHAT_IDS,
} = process.env;

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ================== LOG FILE HANDLER ==================
const LOG_DIR = "./logs";
const LOG_FILE = `${LOG_DIR}/replied.json`;
fs.ensureFileSync(LOG_FILE);
try {
  const data = fs.readFileSync(LOG_FILE, "utf8");
  if (!data.trim()) fs.writeJSONSync(LOG_FILE, []);
} catch {
  fs.writeJSONSync(LOG_FILE, []);
}
if (!fs.existsSync(LOG_FILE)) fs.writeJSONSync(LOG_FILE, []);

// Auto cleanup helper
async function cleanupLogs() {
  const logs = await fs.readJSON(LOG_FILE);
  if (logs.length > 500) {
    const trimmed = logs.slice(-400); // keep 400 newest
    await fs.writeJSON(LOG_FILE, trimmed, { spaces: 2 });
    console.log(`🧹 Log cleanup done — ${logs.length - 400} old records removed.`);
  }
}

// ================== TELEGRAM INIT ==================
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN || TELEGRAM_TOKEN, { polling: false });
console.log("🤖 Telegram bot initialized");

// ================== FACEBOOK VERIFY ==================
app.get("/fb/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === FB_VERIFY_TOKEN) {
    console.log("✅ Facebook Webhook Verified");
    return res.status(200).send(challenge);
  } else {
    console.warn("❌ Facebook Webhook Verification Failed");
    return res.sendStatus(403);
  }
});

// ================== FACEBOOK EVENT HANDLER ==================
app.post("/fb/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (value?.item === "comment" && value?.verb === "add") {
      const author = value.from?.name || "Unknown";
      const comment = value.message || "No message";
      const postId = value.post_id;
      const commentId = value.comment_id;
      const postLink = `https://facebook.com/${postId}`;

      const logs = await fs.readJSON(LOG_FILE);
      const exists = logs.find((item) => item.commentId === commentId);
      if (exists) {
        console.log(`⚠️ Duplicate comment ignored: ${commentId}`);
        return res.sendStatus(200);
      }

      const msg = `
🆕 *FB Comment Detected!*
👤 *By:* ${author}
💭 *Comment:* ${comment}
🔗 *Post:* [View Post](${postLink})
🆔 *Comment ID:* \`${commentId}\`

🏷️ _Powered by AHE Technology | Tanya ChatGPT Pro Malaysia_
`;

      await sendTelegramMessage(msg);

      logs.push({ commentId, author, comment, status: "pending", time: new Date().toISOString() });
      await fs.writeJSON(LOG_FILE, logs, { spaces: 2 });
      await cleanupLogs();

      console.log(`[FACEBOOK] 💬 Logged new comment: ${author}`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ FB webhook error:", err.message);
    res.sendStatus(500);
  }
});

// ================== TELEGRAM HANDLER ==================
app.post("/telegram", async (req, res) => {
  try {
    const msg = req.body.message;
    if (!msg) return res.sendStatus(200);

    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    const allowed = ALLOWED_CHAT_IDS?.split(",").map(id => id.trim());

    if (allowed && !allowed.includes(String(chatId))) {
      console.log("⚠️ Unauthorized chat ID:", chatId);
      return res.sendStatus(200);
    }

    // Reply to "Paste your reply" message
    if (msg.reply_to_message && msg.reply_to_message.text.includes("Paste your reply for comment ID")) {
      const match = msg.reply_to_message.text.match(/`(.*?)`/);
      const commentId = match ? match[1] : null;
      if (commentId && text) {
        const posted = await checkIfReplied(commentId);
        if (posted) {
          await sendTelegram(chatId, `⚠️ Comment ID \`${commentId}\` already replied.\n\n🏷️ _AHE Technology | Tanya ChatGPT Pro Malaysia_`);
        } else {
          await postToFacebook(commentId, text);
          await markAsReplied(commentId, text);
          await sendTelegram(chatId, `✅ Reply posted to Facebook successfully!\n\n🏷️ _AHE Technology | Tanya ChatGPT Pro Malaysia_`);
        }
      } else {
        await sendTelegram(chatId, `⚠️ Missing comment ID or reply text.\n\n🏷️ _AHE Technology | Tanya ChatGPT Pro Malaysia_`);
      }
    }

    // /post command
    else if (text?.startsWith("/post")) {
      const parts = text.split(" ");
      const commentId = parts[1];
      if (!commentId) {
        await sendTelegram(chatId, `⚠️ Usage: /post <comment_id>\n\n🏷️ _AHE Technology | Tanya ChatGPT Pro Malaysia_`);
      } else {
        const posted = await checkIfReplied(commentId);
        if (posted) {
          await sendTelegram(chatId, `⚠️ Comment ID \`${commentId}\` already replied.\n\n🏷️ _AHE Technology | Tanya ChatGPT Pro Malaysia_`);
        } else {
          await sendTelegram(chatId, `🧾 Paste your reply for comment ID:\n\`${commentId}\`\n\n🏷️ _AHE Technology | Tanya ChatGPT Pro Malaysia_`, { force_reply: true });
        }
      }
    }

    // /status command
    else if (text === "/status") {
      const summary = await generateStatus();
      await sendTelegram(chatId, summary);
    }

    // /exportlog command
    else if (text === "/exportlog") {
      await sendTelegram(chatId, "📦 Exporting replied log...");
      const filePath = await exportLogFile();
      await sendFileToTelegram(chatId, filePath);
      await sendTelegram(chatId, `✅ Backup log sent!\n\n🏷️ _AHE Technology | Tanya ChatGPT Pro Malaysia_`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Telegram handler error:", err.message);
    res.sendStatus(500);
  }
});

// ================== FUNCTIONS ==================
async function sendTelegramMessage(text) {
  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: "📋 Copy Prompt", callback_data: "copy_prompt" },
        { text: "🗣️ Copy Prompt – AHE Tone", callback_data: "copy_ahe" },
      ],
      [{ text: "📝 Post to FB", switch_inline_query_current_chat: "/post " }],
    ],
  };

  await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    chat_id: ALLOWED_CHAT_IDS,
    text,
    parse_mode: "Markdown",
    reply_markup: inlineKeyboard,
  });
}

async function sendTelegram(chatId, text, options = {}) {
  await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    ...options,
  });
}

async function sendFileToTelegram(chatId, filePath) {
  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("document", fs.createReadStream(filePath));

  await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, formData, {
    headers: formData.getHeaders(),
  });
}

async function postToFacebook(commentId, message) {
  const url = `https://graph.facebook.com/v21.0/${commentId}/comments`;
  await axios.post(`${url}?access_token=${FB_PAGE_TOKEN}`, { message });
  console.log(`✅ Posted reply to FB comment: ${commentId}`);
}

async function checkIfReplied(commentId) {
  const logs = await fs.readJSON(LOG_FILE);
  return logs.some((item) => item.commentId === commentId && item.status === "replied");
}

async function markAsReplied(commentId, replyText) {
  const logs = await fs.readJSON(LOG_FILE);
  const idx = logs.findIndex((i) => i.commentId === commentId);
  if (idx >= 0) {
    logs[idx].status = "replied";
    logs[idx].reply = replyText;
    logs[idx].repliedAt = new Date().toISOString();
  } else {
    logs.push({ commentId, reply: replyText, status: "replied", repliedAt: new Date().toISOString() });
  }
  await fs.writeJSON(LOG_FILE, logs, { spaces: 2 });
  await cleanupLogs();
}

// 🧮 STATUS SUMMARY
async function generateStatus() {
  const logs = await fs.readJSON(LOG_FILE);
  const total = logs.length;
  const replied = logs.filter((x) => x.status === "replied").length;
  const pending = total - replied;
  const recent = logs.slice(-3).reverse();

  let text = `📊 *AHE Tech FB Bridge Status*\n\n🕓 *Total Comments:* ${total}\n✅ *Replied:* ${replied}\n🕐 *Pending:* ${pending}\n\n📋 *Last 3 Entries:*\n`;

  if (recent.length === 0) text += "_No data yet._\n";
  else {
    recent.forEach((r, i) => {
      text += `${i + 1}️⃣ ${r.comment?.slice(0, 50) || "No comment"} → ${r.status === "replied" ? "✅ replied" : "🕐 pending"}\n`;
    });
  }

  text += `\n🏷️ _Powered by AHE Technology | Tanya ChatGPT Pro Malaysia_`;
  return text;
}

// 📦 EXPORT LOG FILE
async function exportLogFile() {
  const date = new Date().toISOString().split("T")[0];
  const filePath = path.join(LOG_DIR, `replied_${date}.json`);
  const logs = await fs.readJSON(LOG_FILE);
  await fs.writeJSON(filePath, logs, { spaces: 2 });
  return filePath;
}

// ================== HEALTH CHECK ==================
app.get("/health", (req, res) => res.send("✅ Server Running OK"));

// ================== START SERVER ==================
app.listen(PORT || 3000, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Base URL: ${PUBLIC_BASE_URL}`);
});
