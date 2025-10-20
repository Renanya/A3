FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN apk update && apk add ffmpeg

RUN npm install

COPY . .

CMD ["node", "app.js"]
