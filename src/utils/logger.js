import fs from 'fs';
import path from 'path';

// Tentukan folder log
const logDir = path.resolve('logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// ====== MAIN LOGGER FUNCTION ======
function writeLog(category, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${category.toUpperCase()}] ${message} ${JSON.stringify(data)}\n`;
  const filePath = path.join(logDir, `${category}.log`);
  fs.appendFileSync(filePath, logLine);
  console.log(logLine.trim());
}

// ====== EXPORT STYLE SESUAI DENGAN ESM ======
const logger = {
  log: writeLog,
};

export default logger;
