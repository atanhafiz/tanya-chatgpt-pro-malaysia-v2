import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import logger from "./utils/logger.js";
import { handleTelegramCommand, handleTelegramCallback } from "./handlers/commentHandler.js";

dotenv.config();

let bot = null;

export async function setupTelegramBot() {
  try {
    const token = process.env.TELEGRAM_TOKEN;
    const BASE_URL = process.env.PUBLIC_BASE_URL || "https://fb.quicktoolstech.com";
    const WEBHOOK_URL = `${BASE_URL}/telegram`;

    if (!token) {
      logger.log("error", "⚠️ TELEGRAM_TOKEN missing in .env");
      console.error("⚠️ TELEGRAM_TOKEN missing in .env");
      return null;
    }

    // Create bot in webhook mode
    bot = new TelegramBot(token, { polling: false });

    // Remove old webhook (avoid conflict)
    await bot.deleteWebHook();

    // Set new webhook
    await bot.setWebHook(WEBHOOK_URL);

    logger.log("telegram", "✅ Telegram bot webhook set", { WEBHOOK_URL });

    // Event listeners
    bot.on("message", (msg) => handleTelegramCommand(msg));
    bot.on("callback_query", (query) => handleTelegramCallback(query));

    console.log(`🤖 Telegram bot active (Webhook Mode) -> ${WEBHOOK_URL}`);
    return bot;
  } catch (err) {
    logger.log("error", "❌ Failed to setup Telegram webhook", { error: err.message });
    console.error("❌ Telegram webhook setup failed:", err.message);
    return null;
  }
}

export function getBot() {
  return bot;
}
