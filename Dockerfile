FROM node:18-alpine

WORKDIR /usr/src/app

# Copy semua dulu untuk debug
COPY . .

# Debug step: senaraikan fail dalam container
RUN echo "=== DEBUG: LISTING FILES IN /usr/src/app ===" && ls -lah /usr/src/app && echo "=============================="

# Cuba install dependencies
RUN if [ -f "/usr/src/app/package.json" ]; then echo "✅ package.json found"; else echo "❌ package.json NOT FOUND"; fi
RUN npm install --omit=dev || true

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "src/server.js"]
