# Dockerfile
FROM node:18-alpine

WORKDIR /usr/src/app

# copy all files first
COPY . .

# move into src
WORKDIR /usr/src/app/src

# install deps
RUN npm install --omit=dev

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
