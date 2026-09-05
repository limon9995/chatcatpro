#!/bin/bash
# Provisions a RESELLER's own custom domain (e.g. app.hisbrand.com): verifies
# DNS points at this VPS, writes an nginx vhost that serves the SAME shared
# dashboard static build as app.chatcat.pro (branding resolves client-side
# via GET /reseller/by-domain, not via nginx), then obtains an SSL cert.
#
# Deliberately NOT the same script as chatcat-add-domain.sh (that one proxies
# to /catalog/by-domain for a merchant's public storefront — wrong target for
# a reseller's dashboard/login domain).
#
# Invoked by ResellerService.activateCustomDomain() via execFile — takes
# exactly one argument (the domain), never a shell string, so the regex
# check below is defense-in-depth, not the only guard.
#
# Usage: chatcat-add-reseller-domain.sh <domain>
# Prints one of: STATUS=OK | STATUS=DNS_NOT_POINTING | STATUS=INVALID_DOMAIN | STATUS=CERTBOT_FAILED
set -euo pipefail

DOMAIN="${1:-}"
VPS_IP="187.127.53.112"
EMAIL="admin@chatcat.pro"
DASHBOARD_ROOT="/var/www/chatcatpro/dashboard/dist"

if ! [[ "$DOMAIN" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$ ]]; then
  echo "STATUS=INVALID_DOMAIN"
  exit 1
fi

RESOLVED_IP="$(dig +short A "$DOMAIN" @8.8.8.8 | tail -n1)"
if [ "$RESOLVED_IP" != "$VPS_IP" ]; then
  echo "STATUS=DNS_NOT_POINTING"
  echo "RESOLVED=${RESOLVED_IP:-none}"
  exit 2
fi

CONF="/etc/nginx/sites-available/$DOMAIN"
if [ ! -f "$CONF" ]; then
  cat > "$CONF" <<NGINXEOF
server {
    listen 80;
    server_name $DOMAIN;
    root $DASHBOARD_ROOT;
    index index.html;
    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }
}
NGINXEOF
  ln -sf "$CONF" "/etc/nginx/sites-enabled/$DOMAIN"
  nginx -t
  systemctl reload nginx
fi

if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect; then
  nginx -t
  systemctl reload nginx
  echo "STATUS=OK"
else
  echo "STATUS=CERTBOT_FAILED"
  exit 3
fi
