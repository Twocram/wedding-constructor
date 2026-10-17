#!/usr/bin/env bash
# Копия базы на ходу → gzip → хранение 30 дней. Если задан RCLONE_REMOTE (например s3:saywed-backups),
# копия уходит ещё и во внешнее хранилище — без этого бэкап живёт на том же диске, что и база.
set -euo pipefail

DIR=/var/lib/saywed/backups
FILE="$DIR/saywed-$(date +%F).db"
mkdir -p "$DIR"

node /opt/saywed-api/dist/cli.js backup "$FILE"
# срок хранения из /privacy: отказные заявки старше 12 месяцев удаляем
node /opt/saywed-api/dist/cli.js purge-lost 12
gzip -f "$FILE"
find "$DIR" -name 'saywed-*.db.gz' -mtime +30 -delete

if [[ -n "${RCLONE_REMOTE:-}" ]]; then
  rclone copy "$FILE.gz" "$RCLONE_REMOTE"
fi
