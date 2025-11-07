// server.js
// AHE Technology — FB ↔ Telegram Manual GPT Pro Share Mode (No OpenAI API)
// Flow: FB comment -> Telegram (buttons) -> /answer via Telegram -> Post back to FB

import express from "express";
import crypto from "crypto";
import axios from "axios";
import { Telegraf, Markup } from "telegraf";

const app = express();
app.use(express.json({ verify: rawBodySaver }));
app.use(express.urlencoded({ extended: true }));

// ----- ENV -----
const {
  PORT = 3000,
  BASE_URL = "http://localhost:3000",
  FB_APP_SECRET,
  FB_PAGE_ACCESS_TOKEN,
  FB_VERIFY_TOKEN,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_ADMIN_CHAT_ID,
  ALLOW_ORIGIN = "*",
} = process.env;

// ----- CORS basic -----
app.use((_, res, next) => {
  res.header("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.header("Access-Control-Allow-Headers", "Content-Type, X-Requested-With");
  next();
});

// ----- TELEGRAM BOT SETUP -----
if (!TELEGRAM_BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN missing");
  process.exit(1);
}
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// We’ll use webhook mode
const TELEGRAM_WEBHOOK_PATH = "/telegram";
const TELEGRAM_WEBHOOK_URL = `${BASE_URL}${TELEGRAM_WEBHOOK_PATH}`;

// In-memory store { commentId: { status, draftAnswer, fb: {...}, tg: {...} } }
const Store = new Map();
/*
  Store model:
  {
    status: 'new' | 'answered' | 'posted',
    draftAnswer: string | null,
    fb: {
      pageId, postId, commentId, authorName, message, permalinkUrl, createdTime
    },
    tg: {
      messageId, chatId
    }
  }
*/

// Optional idempotency store (event signature/uid)
const SeenEvents = new Set();

// ====== HELPERS ======
function rawBodySaver(req, res, buf) {
  // Save raw body for FB signature validation
  req.rawBody = buf;
}

function verifyFacebookSignature(req) {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature || !FB_APP_SECRET) return true; // skip if not configured
  const hmac = crypto.createHmac("sha256", FB_APP_SECRET);
  hmac.update(req.rawBody || "");
  const expected = "sha256=" + hmac.digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function fbGraphUrl(path) {
  return `https://graph.facebook.com/v21.0/${path}?access_token=${FB_PAGE_ACCESS_TOKEN}`;
}

function fbPermalink(postId) {
  // Best-effort permalink (FB will still resolve)
  return `https://facebook.com/${postId}`;
}

function tgButtons(commentId) {
  const st = Store.get(commentId);
  const hasDraft = Boolean(st?.draftAnswer && st.draftAnswer.trim().length > 0);
  return Markup.inlineKeyboard([
    [Markup.button.callback("📝 Copy Prompt", `copy:${commentId}`)],
    [
      Markup.button.callback("✅ Mark Answered", `mark:${commentId}`),
      Markup.button.callback(
        hasDraft ? "📤 Post to FB" : "📤 Post to FB (🚫 No Draft)",
        hasDraft ? `post:${commentId}` : `post-blocked:${commentId}`
      ),
    ],
  ]);
}

function makePromptTemplate(entry) {
  // Prompt untuk ChatGPT Pro (manual) — NO API CALL
  return (
`You are ChatGPT. Help me craft a concise, polite, and context-aware Malay reply (with simple English if helpful) to a Facebook comment.

Context:
- Page/Post ID: ${entry.postId}
- Comment ID: ${entry.commentId}
- Author: ${entry.authorName}
- Comment Text: "${entry.message}"
- Permalink: ${entry.permalinkUrl}

Requirements:
- Keep it respectful, helpful, and short (2-4 sentences).
- No emojis unless suitable.
- Avoid sensitive or private data.
- Return DIRECTLY the final reply text only (no preface, no quotes).`
  );
}

// ====== TELEGRAM BOT HANDLERS ======
bot.on("text", async (ctx, next) => {
  // Handle /answer {comment_id}\n<text...>
  try {
    const txt = ctx.message.text || "";
    if (!txt.startsWith("/answer")) return next();

    const lines = txt.split("\n");
    const header = lines.shift(); // "/answer {comment_id}"
    const body = lines.join("\n").trim();
    const parts = header.split(" ").filter(Boolean);

    if (parts.length < 2) {
      return ctx.reply("❌ Format salah. Guna:\n/answer {comment_id}\n<jawapan>");
    }

    const commentId = parts[1].trim();
    if (!Store.has(commentId)) {
      return ctx.reply("⚠️ comment_id tak jumpa dalam senarai pending.");
    }

    if (!body) {
      return ctx.reply("⚠️ Tiada kandungan jawapan. Sila letak teks di bawah baris /answer.");
    }

    const st = Store.get(commentId);
    st.draftAnswer = body;
    st.status = "answered";
    Store.set(commentId, st);

    // Edit inline buttons supaya Post to FB aktif
    if (st.tg?.messageId && st.tg?.chatId) {
      try {
        await ctx.telegram.editMessageReplyMarkup(
          st.tg.chatId,
          st.tg.messageId,
          undefined,
          tgButtons(commentId).reply_markup
        );
      } catch (e) {
        // Ignore edit errors
      }
    }

    return ctx.reply(`✅ Draft untuk comment_id ${commentId} disimpan.\nTekan "📤 Post to FB" bila ready.`);
  } catch (err) {
    console.error("Telegram /answer error:", err);
    return ctx.reply("❌ Ralat simpan draft /answer.");
  }
});

bot.on("callback_query", async (ctx) => {
  try {
    const data = ctx.callbackQuery.data || "";
    const [action, commentId] = data.split(":");

    if (!commentId) {
      return ctx.answerCbQuery("Invalid payload");
    }

    if (!Store.has(commentId)) {
      await ctx.answerCbQuery("Entry not found / expired");
      return;
    }
    const st = Store.get(commentId);

    // Actions
    if (action === "copy") {
      const prompt = makePromptTemplate(st.fb);
      await ctx.answerCbQuery("Prompt ready");
      await ctx.reply(`📋 Copy Prompt untuk ChatGPT Pro:\n\n${prompt}`);
      return;
    }

    if (action === "mark") {
      st.status = "answered";
      Store.set(commentId, st);
      await ctx.answerCbQuery("Ditandakan sebagai Answered");
      try {
        await ctx.editMessageReplyMarkup(tgButtons(commentId).reply_markup);
      } catch (_) {}
      return;
    }

    if (action === "post-blocked") {
      await ctx.answerCbQuery("Tiada draft answer. Guna /answer {comment_id} dahulu.", { show_alert: true });
      return;
    }

    if (action === "post") {
      if (!st.draftAnswer || !st.draftAnswer.trim()) {
        await ctx.answerCbQuery("Tiada draft answer. Guna /answer {comment_id} dahulu.", { show_alert: true });
        return;
      }
      // Post ke FB
      await ctx.answerCbQuery("Posting ke Facebook...");
      try {
        await axios.post(
          fbGraphUrl(`${encodeURIComponent(commentId)}/comments`),
          { message: st.draftAnswer }
        );
        st.status = "posted";
        Store.set(commentId, st);

        const link = `https://facebook.com/${commentId}`;
        await ctx.reply(`✅ Posted to FB\nLink: ${link}`);
        try {
          await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([]).reply_markup);
        } catch (_) {}
      } catch (err) {
        console.error("FB post error:", err?.response?.data || err.message);
        await ctx.reply("❌ Gagal post ke FB. Sila semak permission & token.");
      }
      return;
    }

    await ctx.answerCbQuery("Unknown action");
  } catch (err) {
    console.error("callback_query error:", err);
    await ctx.answerCbQuery("Error");
  }
});

// Health ping for Telegram webhook
bot.telegram.setWebhook(TELEGRAM_WEBHOOK_URL).then(() => {
  console.log("[TELEGRAM] Webhook set:", TELEGRAM_WEBHOOK_URL);
});
app.use(TELEGRAM_WEBHOOK_PATH, (req, res) => bot.webhookCallback(TELEGRAM_WEBHOOK_PATH)(req, res));

// ====== FACEBOOK WEBHOOK ======
app.get("/fb/webhook", (req, res) => {
  // Verify token handshake
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === FB_VERIFY_TOKEN) {
    console.log("[FACEBOOK] Webhook verified");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/fb/webhook", async (req, res) => {
  console.log(`[REQUEST] ${new Date().toISOString()} POST /fb/webhook`);
  if (!verifyFacebookSignature(req)) {
    console.warn("[FACEBOOK] Invalid signature");
    return res.sendStatus(403);
  }

  const body = req.body;
  if (body.object !== "page") {
    return res.sendStatus(404);
  }

  try {
    for (const entry of body.entry || []) {
      const pageId = entry.id;
      for (const change of entry.changes || []) {
        if (change.field !== "feed") continue;

        const v = change.value || {};
        const item = v.item; // 'comment', 'photo', etc.
        const verb = v.verb; // 'add', 'edited', etc.
        const authorName = v.from?.name || "Unknown";
        const message = v.message || "";
        const commentId = v.comment_id; // exists for comment
        const postId = v.post_id;
        const createdTime = v.created_time;
        const permalinkUrl = fbPermalink(postId);

        // Create event UID for idempotency
        const uid = `${pageId}:${postId}:${commentId || item}:${verb}:${createdTime}`;
        if (SeenEvents.has(uid)) continue;
        SeenEvents.add(uid);

        // Only act on comment:add (komen baru). Photo edited kita boleh log ja.
        if (item === "comment" && verb === "add" && commentId) {
          const entryObj = {
            pageId,
            postId,
            commentId,
            authorName,
            message,
            permalinkUrl,
            createdTime,
          };

          // Store state
          Store.set(commentId, {
            status: "new",
            draftAnswer: null,
            fb: entryObj,
            tg: {},
          });

          // Push ke Telegram
          const text =
            `🆕 FB Comment\n` +
            `Post: ${permalinkUrl}\n` +
            `By: ${authorName}\n` +
            `Text: “${message || "(no text)"}”\n` +
            `CommentID: ${commentId}`;

          const sent = await sendToTelegram(text, tgButtons(commentId));
          if (sent?.message_id) {
            const st = Store.get(commentId);
            st.tg = { messageId: sent.message_id, chatId: sent.chat.id };
            Store.set(commentId, st);
          }

          console.log("[FACEBOOK] 💬 New comment detected", v);
        } else {
          // Log info lain (photo edit, dsb.)
          console.log("[FACEBOOK] (non-comment feed event)", { item, verb, postId });
        }
      }
    }
  } catch (err) {
    console.error("FB webhook handling error:", err?.response?.data || err.message);
  }

  res.sendStatus(200);
});

// ====== UTIL ======
async function sendToTelegram(text, keyboard) {
  try {
    const chatId = TELEGRAM_ADMIN_CHAT_ID;
    if (!chatId) {
      console.warn("⚠️ TELEGRAM_ADMIN_CHAT_ID not set, skipping Telegram send");
      return null;
    }
    const res = await bot.telegram.sendMessage(chatId, text, {
      parse_mode: "HTML",
      ...(keyboard ? keyboard : {}),
    });
    return res;
  } catch (err) {
    console.error("sendToTelegram error:", err?.response?.data || err.message);
    return null;
  }
}

// ====== MISC ROUTES ======
app.get("/", (_, res) => {
  res.status(200).send("AHE FB ↔ Telegram Bridge (Manual GPT Pro Share Mode) is running.");
});
app.get("/health", (_, res) => res.status(200).json({ ok: true, ts: new Date().toISOString() }));
app.get("/privacy", (_, res) => {
  res.type("text/plain").send("We only relay Facebook comments to the admin Telegram chat for manual processing. No data sold.");
});

// ====== START SERVER ======
app.listen(PORT, () => {
  console.log(`[SERVER] Listening on port ${PORT}`);
  console.log(`🚀 Server running at ${BASE_URL}`);
  console.log(`📘 Facebook webhook: ${BASE_URL}/fb/webhook`);
  console.log(`🤖 Telegram webhook: ${BASE_URL}${TELEGRAM_WEBHOOK_PATH}`);
  console.log(`❤️ Health check: ${BASE_URL}/health`);
  console.log(`🔒 Privacy policy: ${BASE_URL}/privacy`);
});

/* =======================
   Notes for scaling:
   - Replace in-memory Store & SeenEvents with Redis.
   - Keep one bot webhook URL consistent across instances.
   ======================= */
