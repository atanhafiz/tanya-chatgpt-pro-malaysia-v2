# === Stage 1: Base image ===
FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files first for dependency install
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy the rest of the project files
COPY . .

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Health check for Render
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server
CMD ["node", "src/server.js"]
