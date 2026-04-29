FROM node:24-alpine

WORKDIR /app

COPY package.json ./
COPY server.mjs ./
COPY public ./public
COPY data ./data
COPY lib ./lib
COPY scripts ./scripts

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.mjs"]
