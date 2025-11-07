import logger from "./utils/logger.js";
import { handleNewComment } from "./handlers/commentHandler.js";

export const handleFBWebhook = async (req, res) => {
  try {
    const body = req.body;
    logger.log("facebook", "📩 Incoming Facebook Webhook", body);

    if (body.object === "page") {
      for (const entry of body.entry) {
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field === "feed") {
            const value = change.value;
            if (value.item === "comment" && value.verb === "add") {
              await handleNewComment(value);
            }
          }
        }
      }
      res.sendStatus(200);
    } else res.sendStatus(404);
  } catch (error) {
    logger.log("error", "❌ Error handling FB webhook", { error: error.message });
    res.sendStatus(500);
  }
};
