FROM node:20-alpine
WORKDIR /app
RUN npm install ioredis
COPY sync.mjs .
CMD ["node", "sync.mjs"]