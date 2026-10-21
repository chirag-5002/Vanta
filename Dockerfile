FROM node:20-alpine

WORKDIR /usr/src/app

RUN mkdir -p logs

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
