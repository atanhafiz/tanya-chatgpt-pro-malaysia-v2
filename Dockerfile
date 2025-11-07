FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files first
COPY package*.json /usr/src/app/

# Install dependencies
RUN npm install --omit=dev

# Copy the rest of the application
COPY . /usr/src/app

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start app
CMD ["node", "src/server.js"]
