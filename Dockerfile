FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy everything into container
COPY . .

# Install dependencies
RUN cd /app && npm install --omit=dev

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the server
CMD ["node", "src/server.js"]
