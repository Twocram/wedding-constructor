#!/usr/bin/env bash
# Первичная настройка сервера под сайт saywed.ru (статика из CI). Запуск от root, один раз:
#   ssh root@<IP> 'CI_PUBKEY="ssh-ed25519 AAAA… saywed-ci" bash -s' < deploy/setup-site.sh
# Сертификат выпускается отдельно, когда A-записи домена уже смотрят на этот сервер:
#   certbot --nginx -d saywed.ru -d www.saywed.ru --redirect --agree-tos -m <email>
set -euo pipefail

: "${CI_PUBKEY:?нужен публичный ключ CI в CI_PUBKEY}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q nginx certbot python3-certbot-nginx rsync

# под этим пользователем CI заливает файлы; пароля нет, вход только по ключу
id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
grep -qxF "$CI_PUBKEY" /home/deploy/.ssh/authorized_keys 2>/dev/null || echo "$CI_PUBKEY" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

install -d -o deploy -g deploy -m 755 /var/www/wedding

cat > /etc/nginx/sites-available/saywed.ru <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name saywed.ru www.saywed.ru;

    root /var/www/wedding;
    index index.html;

    # файлы сборки Astro с хешем в имени — кешируются навсегда
    location /_astro/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ $uri.html =404;
    }

}
NGINX

ln -sf /etc/nginx/sites-available/saywed.ru /etc/nginx/sites-enabled/saywed.ru
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "Готово: nginx отдаёт /var/www/wedding, CI заходит как deploy."
