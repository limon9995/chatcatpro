#!/bin/bash
# ============================================================
#  Chatcat Pro — Backend Deploy Script
#  Run on VPS after pulling latest code:
#    cd /var/www/chatcatpro/backend
#    bash scripts/deploy.sh
# ============================================================

set -e  # Stop on first error

echo "========================================"
echo "  Chatcat Pro — Deploy $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

# 1. Install production dependencies only
echo "[1/5] Installing dependencies..."
npm ci --omit=dev

# 2. Generate Prisma client
echo "[2/5] Generating Prisma client..."
npx prisma generate

# 3. Run pending migrations (safe — only applies what hasn't been applied yet)
echo "[3/5] Running database migrations..."
npx prisma migrate deploy

# 4. Build the NestJS app
echo "[4/5] Building application..."
node ./node_modules/@nestjs/cli/bin/nest.js build

# 5. Restart PM2
echo "[5/5] Restarting PM2..."
mkdir -p logs
pm2 reload ecosystem.config.js --env production || pm2 start ecosystem.config.js --env production

echo ""
echo "✅ Deploy complete!"
echo "   Logs: pm2 logs chatcatpro"
echo "   Status: pm2 status"
