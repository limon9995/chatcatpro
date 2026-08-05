#!/bin/bash
# Provisions a client's custom domain: verifies DNS points at this VPS,
# writes an nginx vhost that reverse-proxies to the backend via the
# /catalog/by-domain host/path query rewrite, then obtains an SSL cert.
# Invoked by ClientDashboardService.activateCustomDomain() via execFile —
# takes exactly one argument (the domain), never a shell string, so the
# regex check below is defense-in-depth, not the only guard.
#
# Usage: chatcat-add-domain.sh <domain>
# Prints one of: STATUS=OK | STATUS=DNS_NOT_POINTING | STATUS=INVALID_DOMAIN | STATUS=CERTBOT_FAILED
set -euo pipefail

DOMAIN="${1:-}"
VPS_IP="200.97.166.34"
EMAIL="admin@chatcat.pro"

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
    location / {
        proxy_pass http://localhost:3000/catalog/by-domain?host=$DOMAIN&path=\$uri&q=\$arg_q&codes=\$arg_codes&select=\$arg_select&category=\$arg_category;
        proxy_set_header X-Real-IP \$remote_addr;
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
