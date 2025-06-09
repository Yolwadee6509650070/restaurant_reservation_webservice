# Dockerfile (Multi-stage)
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
FROM builder AS tester
RUN npm test

FROM builder AS prod
EXPOSE 3000
USER node
CMD ["node", "src/index.js"]