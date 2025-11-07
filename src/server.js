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
  FB_PAGE_TOKEN,
  FB_VERIFY_TOKEN,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_TOKEN,
  ALLOWED_CHAT_IDS,
  PUBLIC_BASE_URL,
} = process.env;

const app = express();
app.use(cors());
app.use(bodyParser.json());

const LOG_DIR = "./logs";
const LOG_FILE = `${LOG_DIR}/replied.json`;
fs.ensureFileSync(LOG_FILE);
if (!fs.existsSync(LOG_FILE)) fs.writeJSONSync(LOG_FILE, []);

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN || TELEGRAM_TOKEN, { polling: false });
console.log("🤖 Telegram bot initialized");

// ================== FACEBOOK WEBHOOK VERIFY ==================
app.get("/fb/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode && token === FB_VERIFY_TOKEN) return res.status(200).send(challenge);
  res.sendStatus(403);
});

// ================== FACEBOOK EVENT ==================
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

      const msg = `
🆕 *FB Comment Detected!*
👤 *By:* ${author}
💭 *Comment:* ${comment}
🔗 *Post:* [View Post](${postLink})
🆔 *Comment ID:* \`${commentId}\`

🏷️ _Powered by AHE Technology | Tanya ChatGPT Pro Malaysia_
`;

      await sendTelegramMessage(msg, author, comment);
      console.log(`[FACEBOOK] 💬 New comment logged: ${author}`);
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
    const allowed = ALLOWED_CHAT_IDS?.split(",").map((id) => id.trim());

    if (allowed && !allowed.includes(String(chatId))) return res.sendStatus(200);

    // Handle reply to "Paste your reply"
    if (msg.reply_to_message && msg.reply_to_message.text.includes("Paste your reply for comment ID")) {
      const match = msg.reply_to_message.text.match(/`(.*?)`/);
      const commentId = match ? match[1] : null;
      if (commentId && text) {
        await postToFacebook(commentId, text);
        await sendTelegram(chatId, `✅ Reply posted to Facebook!\n\n🏷️ _AHE Technology | Tanya ChatGPT Pro Malaysia_`);
      }
    }

    // Handle /post <comment_id>
    else if (text?.startsWith("/post")) {
      const commentId = text.split(" ")[1];
      if (!commentId)
        return await sendTelegram(chatId, `⚠️ Usage: /post <comment_id>`);
      await sendTelegram(chatId, `🧾 Paste your reply for comment ID:\n\`${commentId}\``, { force_reply: true });
    }

    // Handle /status
    else if (text === "/status") {
      await sendTelegram(chatId, "📊 System OK — v1.5.2 running");
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Telegram handler error:", err.message);
    res.sendStatus(500);
  }
});

// ================== FUNCTIONS ==================
async function sendTelegramMessage(text, author, comment) {
  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: "📋 Copy Prompt", callback_data: "copy_prompt" },
        { text: "🗣️ Copy Prompt – AHE Tone", callback_data: "copy_ahe" },
      ],
      [{ text: "📝 Post to FB", switch_inline_query_current_chat: "/post " }],
    ],
  };

  // send main message
  const sent = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    chat_id: ALLOWED_CHAT_IDS,
    text,
    parse_mode: "Markdown",
    reply_markup: inlineKeyboard,
  });

  // Listen for callback button click
  bot.on("callback_query", async (query) => {
    if (query.data === "copy_prompt" || query.data === "copy_ahe") {
      const aheTone = query.data === "copy_ahe";
      const prompt = aheTone
        ? `🎯 *AHE Prompt Style*\n\nTolong jawab komen ni dengan tone profesional & mesra pelanggan AHE:\n\n"${comment}"`
        : `💬 *Prompt:*\n\n"${comment}"`;

      await bot.sendMessage(query.message.chat.id, prompt, { parse_mode: "Markdown" });
    }
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

async function postToFacebook(commentId, message) {
  const url = `https://graph.facebook.com/v21.0/${commentId}/comments`;
  await axios.post(`${url}?access_token=${FB_PAGE_TOKEN}`, { message });
  console.log(`✅ Posted reply to FB comment: ${commentId}`);
}

app.get("/health", (req, res) => res.send("✅ Server Running OK"));

app.listen(PORT || 3000, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Base URL: ${PUBLIC_BASE_URL}`);
});
