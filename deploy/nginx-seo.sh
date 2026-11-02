#!/usr/bin/env bash
# Один адрес сайта и своя 404: дописывает две строки в HTTPS-блок saywed.ru, повторный запуск ничего не меняет.
#   ssh root@<IP> bash -s < deploy/nginx-seo.sh
set -euo pipefail

f="${1:-/etc/nginx/sites-available/saywed.ru}"
if grep -q 'error_page 404 /404.html' "$f"; then
  echo "уже настроено"
  exit 0
fi

backup="$f.bak"
[ -n "${1:-}" ] || backup=/root/saywed.ru.nginx.bak
cp -p "$f" "$backup"
tmp=$(mktemp)
awk '/listen 443/ && !done {
  print "    if ($host = www.saywed.ru) { return 301 https://saywed.ru$request_uri; }"
  print "    error_page 404 /404.html;"
  done = 1
} { print }' "$f" > "$tmp"
cat "$tmp" > "$f"
rm -f "$tmp"

[ -z "${1:-}" ] || exit 0
if nginx -t; then
  systemctl reload nginx
  echo "готово"
else
  cp -p "$backup" "$f"
  echo "ошибка конфига, вернул как было" >&2
  exit 1
fi
