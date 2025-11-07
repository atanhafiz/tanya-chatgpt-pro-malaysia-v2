import dotenv from 'dotenv';
import express from 'express';
import { handleFBWebhook } from './fbWebhook.js';
import { setupTelegramBot, getBot } from './telegramHandler.js';
import logger from './utils/logger.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

// === Middleware ===
app.use(express.urlencoded({ extended: true }));

// JSON parser except for Facebook webhook
app.use((req, res, next) => {
  if (req.path === '/fb/webhook' && req.method === 'POST') {
    express.raw({ type: 'application/json' })(req, res, () => {
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

// === Request logging middleware ===
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  logger.log('request', `[${timestamp}] ${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// === Facebook Webhook Verification ===
app.get('/fb/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || 'my_verify_token';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    logger.log('webhook', '✅ Facebook webhook verified', { challenge });
    res.status(200).send(challenge);
  } else {
    logger.log('webhook', '❌ Facebook webhook verification failed', { mode, token });
    res.sendStatus(403);
  }
});

// === Facebook Webhook POST Handler ===
app.post('/fb/webhook', handleFBWebhook);

// === Telegram Webhook Route ===
app.post('/telegram', (req, res) => {
  const bot = getBot();
  if (bot) bot.processUpdate(req.body);
  res.status(200).send('OK');
});

// === Health Check Endpoint ===
app.get('/health', (req, res) => {
  res.json({ status: 'ok', base_url: BASE_URL, timestamp: new Date().toISOString() });
});

// === Root Endpoint ===
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'GPT Pro Malaysia - Facebook Comment Reply System',
    base_url: BASE_URL,
    endpoints: {
      health: '/health',
      facebookWebhook: '/fb/webhook',
      telegramWebhook: '/telegram'
    },
    timestamp: new Date().toISOString()
  });
});

// === Telegram Bot Initialization ===
try {
  setupTelegramBot();
} catch (error) {
  logger.log('error', '⚠️ Failed to initialize Telegram bot', { error: error.message });
  console.error('⚠️ Telegram bot initialization failed, but server continues:', error.message);
}

// === Error Handling Middleware ===
app.use((err, req, res, next) => {
  logger.log('error', 'Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// === Start Server ===
app
  .listen(PORT, '0.0.0.0', () => {
    logger.log('server', `Server started on port ${PORT}`, { port: PORT });
    console.log(`🚀 Server running at ${BASE_URL}`);
    console.log(`📘 Facebook webhook: ${BASE_URL}/fb/webhook`);
    console.log(`🤖 Telegram webhook: ${BASE_URL}/telegram`);
    console.log(`❤️ Health check: ${BASE_URL}/health`);
  })
  .on('error', (err) => {
    logger.log('error', 'Server failed to start', { error: err.message });
    console.error('❌ Server failed to start:', err.message);
    process.exit(1);
  });
