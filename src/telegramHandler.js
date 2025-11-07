import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import logger from "./utils/logger.js";
import { handleTelegramCommand, handleTelegramCallback } from "./handlers/commentHandler.js";

dotenv.config();

let bot = null;

export function setupTelegramBot() {
  const token = process.env.TELEGRAM_TOKEN;
  if (!token) {
    console.error("⚠️ TELEGRAM_TOKEN missing");
    return null;
  }

  bot = new TelegramBot(token, { polling: true });
  logger.log("telegram", "✅ Telegram bot running (polling mode)", { token: token.slice(0, 8) + "****" });

  bot.on("message", (msg) => handleTelegramCommand(msg));
  bot.on("callback_query", (query) => handleTelegramCallback(query));

  return bot;
}

export function getBot() {
  return bot;
}
