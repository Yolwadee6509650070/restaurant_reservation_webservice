#!/bin/bash
# ทดสอบก่อน deploy
npm test || exit 1

# Deploy ไปที่เซิร์ฟเวอร์
ssh user@your-server "cd /path/to/app && git pull && docker-compose up -d"