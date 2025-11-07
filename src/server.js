import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import axios from "axios";
import cors from "cors";
dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const {
  PORT,
  FB_PAGE_TOKEN,
  FB_VERIFY_TOKEN,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  PUBLIC_BASE_URL,
} = process.env;

let lastCommentId = null; // simpan comment ID terakhir dari Telegram

// ✅ FACEBOOK VERIFY
app.get("/fb/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode && token === FB_VERIFY_TOKEN) return res.status(200).send(challenge);
  res.sendStatus(403);
});

// ✅ FACEBOOK EVENT → SEND TO TELEGRAM
app.post("/fb/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (value?.item === "comment" && value?.verb === "add") {
      const author = value.from?.name || "Unknown";
      const comment = value.message || "(No text)";
      const commentId = value.comment_id;

      const text = 
`👤 *By:* ${author}
💬 *Comment:*
\`\`\`
${comment}
\`\`\`
🆔 *Comment ID:* \`${commentId}\`

👉 *Salin komen di atas & paste ke ChatGPT untuk dapat jawapan.*`;

      const inlineKeyboard = {
        inline_keyboard: [[{ text: "📝 Post to FB", callback_data: `post_${commentId}` }]],
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
    const update = req.body;

    // === CALLBACK (bila tekan Post to FB) ===
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;
      const commentId = cb.data.replace("post_", "");

      // Simpan ID terakhir
      lastCommentId = commentId;

      // Hantar respon cepat untuk elak retry
      res.sendStatus(200);

      try {
        await sendTelegram(
          chatId,
          `🧾 Paste jawapan ChatGPT untuk komen ni:\n\`${commentId}\``,
          { force_reply: true }
        );

        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
          callback_query_id: cb.id,
        });

        console.log(`🟢 Callback processed untuk commentId: ${commentId}`);
      } catch (err) {
        console.error("❌ Callback processing error:", err.response?.data || err.message);
      }
      return;
    }

    // === USER MESSAGE (Paste jawapan ChatGPT) ===
    const msg = update.message;
    if (!msg) return res.sendStatus(200);

    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    let commentId = null;

    // kalau mesej reply kepada bot
    if (msg.reply_to_message && msg.reply_to_message.text.includes("Paste jawapan ChatGPT")) {
      const match = msg.reply_to_message.text.match(/`(.*?)`/);
      commentId = match ? match[1] : null;
    }

    // fallback guna lastCommentId
    if (!commentId && lastCommentId) commentId = lastCommentId;

    // kalau mesej ada ID dalam teks
    const idMatch = text?.match(/\d+_\d+/);
    if (!commentId && idMatch) commentId = idMatch[0];

    if (!commentId) {
      console.log("⚠️ Tiada commentId dijumpai dalam mesej:", text);
      return res.sendStatus(200);
    }

    // post ke FB bila cukup panjang
    if (commentId && text.length > 3) {
      await postToFacebook(commentId, text);
      await sendTelegram(chatId, `✅ Dah auto-reply komen dekat Facebook!\n🆔 ${commentId}`);
      console.log(`✅ FB reply sent for ${commentId}`);
      lastCommentId = null; // reset ID lepas berjaya
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Telegram webhook error:", err.message || err);
    res.status(500).send("Webhook processing error");
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

// ✅ START SERVER
app.listen(PORT || 3000, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Base URL: ${PUBLIC_BASE_URL}`);
});
