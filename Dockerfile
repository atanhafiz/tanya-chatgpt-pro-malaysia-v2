# Dockerfile
FROM node:18-alpine

WORKDIR /usr/src/app

# Copy package files first for better layer caching
COPY src/package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy the rest of the application
COPY src/ ./

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

# Health check for Render
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server.js"]
