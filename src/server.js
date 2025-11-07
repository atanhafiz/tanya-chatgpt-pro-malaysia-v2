import dotenv from "dotenv";
import express from "express";
import { handleFBWebhook } from "./fbWebhook.js";
import { setupTelegramBot, getBot } from "./telegramHandler.js";
import logger from "./utils/logger.js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

// === Basic setup ===
const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.PUBLIC_BASE_URL || "https://fb.quicktoolstech.com";

// === File path ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === Middleware ===
app.use(express.urlencoded({ extended: true }));

// JSON parser kecuali FB webhook
app.use((req, res, next) => {
  if (req.path === "/fb/webhook" && req.method === "POST") {
    express.raw({ type: "application/json" })(req, res, () => {
      req.rawBody = req.body;
      try {
        if (Buffer.isBuffer(req.body)) {
          req.body = JSON.parse(req.body.toString());
        }
      } catch {
        // ignore parse errors
      }
      next();
    });
  } else {
    express.json()(req, res, next);
  }
});

// === Request logger ===
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  logger.log("request", `[${timestamp}] ${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// === Facebook webhook verify ===
app.get("/fb/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || "my_verify_token";

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    logger.log("webhook", "✅ Facebook webhook verified", { challenge });
    res.status(200).send(challenge);
  } else {
    logger.log("webhook", "❌ Facebook webhook verification failed", { mode, token });
    res.sendStatus(403);
  }
});

// === Facebook webhook POST ===
app.post("/fb/webhook", handleFBWebhook);

// === Telegram webhook endpoint ===
app.post("/telegram", (req, res) => {
  const bot = getBot();
  if (bot) bot.processUpdate(req.body);
  res.status(200).send("OK");
});

// === Health check ===
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    base_url: BASE_URL,
    timestamp: new Date().toISOString(),
  });
});

// === Privacy page ===
app.get("/privacy", (req, res) => {
  res.sendFile(path.join(__dirname, "privacy.html"));
});

// === Root ===
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "AHE Manual GPT Pro Share Mode",
    base_url: BASE_URL,
    endpoints: {
      health: "/health",
      facebookWebhook: "/fb/webhook",
      telegramWebhook: "/telegram",
      privacy: "/privacy",
    },
    timestamp: new Date().toISOString(),
  });
});

// === Telegram bot initialization (async) ===
(async () => {
  try {
    await setupTelegramBot();
  } catch (error) {
    logger.log("error", "⚠️ Telegram bot initialization failed", { error: error.message });
    console.error("⚠️ Telegram bot initialization failed, but server continues:", error.message);
  }
})();

// === Error handler ===
app.use((err, req, res, next) => {
  logger.log("error", "Unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Internal server error", message: err.message });
});

// === Start server ===
app
  .listen(PORT, "0.0.0.0", () => {
    logger.log("server", `Server started on port ${PORT}`, { port: PORT });
    console.log(`🚀 Server running at ${BASE_URL}`);
    console.log(`📘 Facebook webhook: ${BASE_URL}/fb/webhook`);
    console.log(`🤖 Telegram webhook: ${BASE_URL}/telegram`);
    console.log(`❤️ Health check: ${BASE_URL}/health`);
    console.log(`🔒 Privacy policy: ${BASE_URL}/privacy`);
  })
  .on("error", (err) => {
    logger.log("error", "Server failed to start", { error: err.message });
    console.error("❌ Server failed to start:", err.message);
    process.exit(1);
  });
