# Dockerfile

# Stage 1: Builder (installs ALL dependencies for both testing and production build)
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: Tester (uses the builder stage to run tests)
FROM builder AS tester
COPY . .
RUN npm test

# Stage 3: Production (builds a minimal image for deployment)
FROM node:18-alpine AS prod
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
# COPY db ./db # ถ้ามีโฟลเดอร์ db แยก

ENV NODE_ENV=production
ENV PORT=4000
ENV DB_PATH=/app/serviceB.sqlite

EXPOSE 4000
USER node
CMD ["node", "src/index.js"]