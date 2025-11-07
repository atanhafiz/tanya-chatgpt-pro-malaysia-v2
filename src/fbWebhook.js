import logger from './utils/logger.js';

export const handleFBWebhook = async (req, res) => {
  try {
    const body = req.body;

    // Log semua payload yang Facebook hantar
    logger.log('facebook', '📩 Incoming Facebook Webhook', body);
    console.log('📩 Incoming Facebook Webhook:', JSON.stringify(body, null, 2));

    // Check type webhook (feed / comment / message)
    if (body.object === 'page') {
      body.entry.forEach(entry => {
        const changes = entry.changes || [];
        changes.forEach(change => {
          if (change.field === 'feed') {
            const value = change.value;
            if (value.item === 'comment') {
              logger.log('facebook', '💬 New comment detected', value);
              console.log('💬 Comment by:', value.from?.name, '| Message:', value.message);
            } else if (value.item === 'post') {
              logger.log('facebook', '📝 Post event detected', value);
            }
          } else if (change.field === 'messages') {
            logger.log('facebook', '📨 Messenger message detected', change.value);
          }
        });
      });
      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }

  } catch (error) {
    logger.log('error', '❌ Error handling Facebook webhook', { error: error.message });
    console.error('❌ Error handling Facebook webhook:', error);
    res.sendStatus(500);
  }
};
