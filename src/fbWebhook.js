import axios from 'axios';
import logger from './utils/logger.js';
import { getBot } from './telegramHandler.js';

// ====== MAIN FACEBOOK WEBHOOK HANDLER ======
export async function handleFBWebhook(req, res) {
  try {
    const body = req.body;

    // Pastikan data valid
    if (!body.object || !body.entry) {
      logger.log('webhook', 'Invalid Facebook payload', body);
      return res.sendStatus(400);
    }

    for (const entry of body.entry) {
      const event = entry.messaging?.[0];

      if (!event || !event.message || !event.sender) continue;

      const senderId = event.sender.id;
      const messageText = event.message.text || '(no text)';
      const pageId = entry.id;

      logger.log('facebook', 'Incoming FB message', { senderId, messageText });

      // Hantar ke Telegram
      const bot = getBot();
      if (bot) {
        const chatId = process.env.TELEGRAM_CHAT_ID;
        const msg = `💬 *Facebook Comment Detected*\n\n🆔 Sender: ${senderId}\n📝 Message: ${messageText}\n📘 Page ID: ${pageId}`;
        await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
        logger.log('telegram', 'Forwarded FB message to Telegram', { chatId });
      }

      // Contoh reply balik ke FB (optional)
      if (process.env.FB_PAGE_TOKEN) {
        await replyToFacebook(senderId, messageText);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    logger.log('error', 'Error in handleFBWebhook', { error: err.message });
    console.error('❌ handleFBWebhook failed:', err.message);
    res.sendStatus(500);
  }
}

// ====== OPTIONAL: Reply balik ke FB Page (guna Graph API) ======
async function replyToFacebook(senderId, text) {
  try {
    const token = process.env.FB_PAGE_TOKEN;
    const url = `https://graph.facebook.com/v17.0/me/messages?access_token=${token}`;
    await axios.post(url, {
      recipient: { id: senderId },
      message: { text: `Terima kasih! Kami telah terima mesej: "${text}"` }
    });
    logger.log('facebook', 'Auto-replied to FB user', { senderId });
  } catch (err) {
    logger.log('error', 'Failed to reply to Facebook user', { error: err.message });
  }
}
