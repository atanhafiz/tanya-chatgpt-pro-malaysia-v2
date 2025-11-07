import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import axios from "axios";
import cors from "cors";
dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const { PORT, FB_PAGE_TOKEN, FB_VERIFY_TOKEN, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, PUBLIC_BASE_URL } = process.env;

// ✅ FACEBOOK VERIFY
app.get("/fb/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode && token === FB_VERIFY_TOKEN) return res.status(200).send(challenge);
  res.sendStatus(403);
});

// ✅ FACEBOOK EVENT
app.post("/fb/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (value?.item === "comment" && value?.verb === "add") {
      const author = value.from?.name || "Unknown";
      const comment = value.message || "No message";
      const commentId = value.comment_id;

      const text = `👤 By: ${author}\n💬 Comment: ${comment}\n🆔 Comment ID: \`${commentId}\``;

      const inlineKeyboard = {
        inline_keyboard: [[{ text: "📝 Post to FB", switch_inline_query_current_chat: `/post ${commentId}` }]],
      };

      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "Markdown",
        reply_markup: inlineKeyboard,
      });

      console.log(`[FB→TG] ${author}: ${comment}`);
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ FB→TG Error:", err.response?.data || err.message);
    res.sendStatus(500);
  }
});

// ✅ TELEGRAM HANDLER
app.post("/telegram", async (req, res) => {
  try {
    const msg = req.body.message;
    if (!msg) return res.sendStatus(200);

    const chatId = msg.chat.id;
    const text = msg.text?.trim();

    if (text?.startsWith("/post")) {
      const commentId = text.split(" ")[1];
      if (!commentId) return await sendTelegram(chatId, "⚠️ Guna format: /post <comment_id>");
      await sendTelegram(chatId, `🧾 Paste jawapan ChatGPT untuk komen ni:\n\`${commentId}\``, { force_reply: true });
    } else if (msg.reply_to_message && msg.reply_to_message.text.includes("Paste jawapan ChatGPT")) {
      const match = msg.reply_to_message.text.match(/`(.*?)`/);
      const commentId = match ? match[1] : null;
      if (commentId && text) {
        await postToFacebook(commentId, text);
        await sendTelegram(chatId, "✅ Dah auto reply komen dekat Facebook!");
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Telegram handler error:", err.message);
    res.sendStatus(500);
  }
});

// ✅ FUNCTIONS
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
  try {
    const res = await axios.post(`${url}?access_token=${FB_PAGE_TOKEN}`, { message });
    console.log(`✅ Posted reply to FB comment: ${commentId}`, res.data);
  } catch (err) {
    console.error("❌ FB post error:", err.response?.data || err.message);
  }
}

// ✅ HEALTH CHECK
app.get("/health", (_, res) => res.send("✅ Server Running OK"));

// ✅ START
app.listen(PORT || 3000, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Base URL: ${PUBLIC_BASE_URL}`);
});
