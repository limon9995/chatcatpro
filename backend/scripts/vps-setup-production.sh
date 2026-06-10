#!/bin/bash
# One-time production hardening for the ChatCat VPS.
# Run as root on the server:  bash /var/www/chatcatpro/backend/scripts/vps-setup-production.sh
set -e

echo "── 1/4 Daily backup script ──────────────────────────────────"
mkdir -p /root/backups
cat > /root/backup-chatcat.sh << 'EOF'
#!/bin/bash
# Daily ChatCat backup: PostgreSQL DB + file storage. Keeps last 7 days.
set -e
STAMP=$(date +%F)
DIR=/root/backups/$STAMP
mkdir -p "$DIR"
sudo -u postgres pg_dump chatcatpro_dev | gzip > "$DIR/chatcatpro-db.sql.gz"
tar czf "$DIR/chatcat-storage.tar.gz" -C /var/www/chatcatpro/backend storage data 2>/dev/null || true
find /root/backups -maxdepth 1 -type d -name "20*" -mtime +7 -exec rm -rf {} \;
echo "$(date -Is) backup OK -> $DIR ($(du -sh "$DIR" | cut -f1))" >> /root/backups/backup.log
EOF
chmod 700 /root/backup-chatcat.sh
bash /root/backup-chatcat.sh
echo "Test backup done:"; ls -lh "/root/backups/$(date +%F)/"

echo "── 2/4 Cron: backup every night 21:00 UTC (3 AM Bangladesh) ─"
( crontab -l 2>/dev/null | grep -v backup-chatcat.sh ; echo "0 21 * * * /root/backup-chatcat.sh" ) | crontab -
crontab -l

echo "── 3/4 Log rotation for PM2 + app logs ─────────────────────"
cat > /etc/logrotate.d/pm2-apps << 'EOF'
/root/.pm2/logs/*.log /var/www/chatcatpro/backend/logs/*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
    copytruncate
}
EOF
logrotate -d /etc/logrotate.d/pm2-apps 2>&1 | tail -2

echo "── 4/4 PM2 survives reboot ──────────────────────────────────"
pm2 startup systemd -u root --hp /root | tail -1 | bash - 2>/dev/null || true
pm2 save

echo ""
echo "✅ Done: nightly backups (7-day retention), logrotate, PM2 reboot persistence."
