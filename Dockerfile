# Dockerfile
FROM node:18-alpine

WORKDIR /usr/src/app

# Copy ONLY contents of src (not the folder itself)
COPY src/ ./

RUN npm install --omit=dev

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
