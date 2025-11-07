# Dockerfile
FROM node:18-alpine
WORKDIR /usr/src/app

# copy package files from src
COPY src/package*.json ./

# install production dependencies
RUN npm install --production

# copy backend source from src folder
COPY src/ ./

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]

