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

# 1. Install ALL dependencies (including devDeps needed for build)
echo "[1/6] Installing all dependencies..."
npm ci

# 2. Generate Prisma client
echo "[2/6] Generating Prisma client..."
npx prisma generate

# 3. Sync schema to database (db push — safe for PostgreSQL with no migration history)
echo "[3/6] Syncing database schema..."
npx prisma db push --accept-data-loss

# 4. Build the NestJS app
echo "[4/6] Building application..."
node ./node_modules/@nestjs/cli/bin/nest.js build

# 5. Remove devDependencies after build to save memory
echo "[5/6] Pruning dev dependencies..."
npm prune --omit=dev

# 6. Restart PM2
echo "[6/6] Restarting PM2..."
mkdir -p logs
pm2 reload ecosystem.config.js --env production || pm2 start ecosystem.config.js --env production

echo ""
echo "✅ Deploy complete!"
echo "   Logs: pm2 logs chatcatpro"
echo "   Status: pm2 status"
