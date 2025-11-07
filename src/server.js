require('dotenv').config();
const express = require('express');
const { handleFBWebhook } = require('./fbWebhook');
const { setupTelegramBot, getBot } = require('./telegramHandler');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));

// JSON parser for routes except Facebook webhook
app.use((req, res, next) => {
  if (req.path === '/fb/webhook' && req.method === 'POST') {
    // Use raw body for Facebook webhook (for signature verification)
    express.raw({ type: 'application/json' })(req, res, () => {
      // Store raw body for signature verification
      req.rawBody = req.body;
      // Parse JSON after getting raw body
      try {
        if (Buffer.isBuffer(req.body)) {
          req.body = JSON.parse(req.body.toString());
        }
      } catch (e) {
        // If parsing fails, continue
      }
      next();
    });
  } else {
    // Use JSON parser for other routes
    express.json()(req, res, next);
  }
});

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  logger.log('request', `[${timestamp}] ${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// Facebook Webhook Routes
app.get('/fb/webhook', (req, res) => {
  // Facebook webhook verification
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // You can set a verify token in your .env if needed
  const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || 'my_verify_token';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    logger.log('webhook', 'Facebook webhook verified', { challenge });
    res.status(200).send(challenge);
  } else {
    logger.log('webhook', 'Facebook webhook verification failed', { mode, token });
    res.sendStatus(403);
  }
});

app.post('/fb/webhook', handleFBWebhook);

// Telegram Webhook Route
app.post('/telegram', (req, res) => {
  const bot = getBot();
  if (bot) {
    bot.processUpdate(req.body);
  }
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint to prevent white screen
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'GPT Pro Malaysia - Facebook Comment Reply System',
    endpoints: {
      health: '/health',
      facebookWebhook: '/fb/webhook',
      telegramWebhook: '/telegram'
    },
    timestamp: new Date().toISOString() 
  });
});

// Initialize Telegram bot (with error handling)
try {
  setupTelegramBot();
} catch (error) {
  logger.log('error', 'Failed to initialize Telegram bot', { error: error.message });
  console.error('⚠️ Telegram bot initialization failed, but server will continue:', error.message);
}

// Error handling middleware
app.use((err, req, res, next) => {
  logger.log('error', 'Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.log('server', `Server started on port ${PORT}`, { port: PORT });
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Facebook webhook: POST /fb/webhook`);
  console.log(`🤖 Telegram webhook: POST /telegram`);
  console.log(`❤️  Health check: GET /health`);
}).on('error', (err) => {
  logger.log('error', 'Server failed to start', { error: err.message });
  console.error('❌ Server failed to start:', err.message);
  process.exit(1);
});

