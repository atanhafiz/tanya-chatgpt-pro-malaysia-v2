import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import logger from './utils/logger.js';

dotenv.config();

let bot = null;

// === SETUP TELEGRAM BOT ===
export function setupTelegramBot() {
  const token = process.env.TELEGRAM_TOKEN;

  if (!token) {
    logger.log('error', 'TELEGRAM_TOKEN missing in .env');
    console.error('⚠️ TELEGRAM_TOKEN missing in .env');
    return null;
  }

  bot = new TelegramBot(token, { polling: false });
  logger.log('telegram', 'Telegram bot initialized', { token: token.slice(0, 8) + '****' });

  // Basic message listener (optional)
  bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    logger.log('telegram', `Message from ${chatId}: ${msg.text}`);
  });

  return bot;
}

// === GET BOT INSTANCE ===
export function getBot() {
  if (!bot) {
    logger.log('warn', 'getBot() called before setupTelegramBot()');
  }
  return bot;
}
