FROM node:18-alpine
WORKDIR /usr/src/app

# copy everything
COPY . .

# masuk ke src dan install dep
RUN cd src && npm install --omit=dev

EXPOSE 3000
ENV PORT=3000

CMD ["node", "src/server.js"]
