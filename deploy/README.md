# Деплой

Сайт (`apps/site`) — статика в `/var/www/wedding`, как и раньше. API (`apps/api`) — Node-процесс под systemd за nginx, база SQLite в `/var/lib/saywed`. Админка (`apps/admin`) — статика в `/var/www/admin` на `admin.saywed.ru`, ходит в тот же API.

GitHub Actions (`.github/workflows/deploy.yml`) при пуше в main деплоит только изменившееся приложение. Задачи API и админки выключены, пока не выполнена первичная настройка ниже: их включают переменные репозитория `API_DEPLOY_ENABLED` и `ADMIN_DEPLOY_ENABLED`.

## Первичная настройка сервера (один раз)

Команды — от root. `deploy` ниже — пользователь из секрета `VPS_USER`, под которым CI заходит по SSH.

### 1. Node 24 и пользователь сервиса

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs
node -v   # v24.x — та же мажорная версия, что в CI: от неё зависит бинарник better-sqlite3
uname -m  # x86_64 — CI собирает better-sqlite3 под linux-x64; на arm64 нужен arm-раннер в CI

useradd --system --home /var/lib/saywed --shell /usr/sbin/nologin saywed
install -d -o saywed -g saywed -m 750 /var/lib/saywed
install -d -o deploy -g saywed -m 755 /opt/saywed-api
install -d -m 750 -g saywed /etc/saywed
```

### 2. Переменные окружения

```bash
cp api.env.example /etc/saywed/api.env      # из deploy/systemd/
chown root:saywed /etc/saywed/api.env && chmod 640 /etc/saywed/api.env
openssl rand -hex 16                          # → IP_SALT
nano /etc/saywed/api.env                      # TG_BOT_TOKEN, TG_CHAT_ID, IP_SALT
```

`PORT` оставить 3000: на него смотрят nginx-сниппет и проверка здоровья в CI.

`TG_NOTIFY_CONTACTS=true` отправляет имя и контакт клиента в Telegram — это передача персональных данных на зарубежные серверы. Включать только вместе с правкой раздела «Передача третьим лицам» в `/privacy`.

Бот для уведомлений: создать в @BotFather, написать ему что-нибудь (или добавить в общий чат), chat id взять из `https://api.telegram.org/bot<TOKEN>/getUpdates`.

### 3. systemd и права на перезапуск для CI

```bash
cp saywed-api.service saywed-backup.service saywed-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable saywed-api saywed-backup.timer

cat > /etc/sudoers.d/saywed-deploy <<'EOF'
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart saywed-api, /usr/bin/journalctl -u saywed-api -n 50 --no-pager
EOF
chmod 440 /etc/sudoers.d/saywed-deploy && visudo -c
```

### 4. nginx

```bash
cp nginx/api.conf /etc/nginx/snippets/saywed-api.conf
echo 'limit_req_zone $binary_remote_addr zone=saywed_public:10m rate=10r/m;' > /etc/nginx/conf.d/saywed-limits.conf
```

В `server { … }` для saywed.ru (тот, что с `listen 443 ssl`, его вёл certbot) добавить строку:

```nginx
include /etc/nginx/snippets/saywed-api.conf;
```

```bash
nginx -t && systemctl reload nginx
```

### 5. Первый деплой API

В GitHub → Settings → Secrets and variables → Actions → **Variables** добавить `API_DEPLOY_ENABLED = true`, затем Actions → Deploy to VPS → **Run workflow**. Проверка:

```bash
systemctl status saywed-api
curl -s https://saywed.ru/api/health      # {"ok":true}
```

### 6. Пользователи админки

```bash
cd /opt/saywed-api
sudo -u saywed --preserve-env bash -c 'set -a; . /etc/saywed/api.env; node dist/cli.js create-user artyom "Артём"'
```

Пароль выводится один раз. Сброс — `reset-password <login>`, список — `list-users`, последние заявки — `leads 20`.

### 7. Включить форму на сайте

Перед этим заполнить реквизиты оператора в `apps/site/src/site.ts` (`legal`) — они выводятся на `/privacy`. Затем переменная репозитория `LEAD_FORM_ENABLED = true` и Run workflow (или любой пуш в сайт). Без неё кнопки «Заказать» ведут в Telegram, как раньше.

### 8. Админка на admin.saywed.ru

1. DNS: A-запись `admin.saywed.ru` → IP сервера.
2. На сервере:

```bash
install -d -o deploy -g deploy -m 755 /var/www/admin
cp nginx/admin.saywed.ru.conf /etc/nginx/sites-available/admin.saywed.ru
ln -s /etc/nginx/sites-available/admin.saywed.ru /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d admin.saywed.ru
```

3. Переменная репозитория `ADMIN_DEPLOY_ENABLED = true` → Run workflow. Вход — логином и паролем из шага 6. Ссылка «Открыть в админке» в уведомлениях Telegram ведёт сразу в карточку заявки.

## Бэкапы

`saywed-backup.timer` каждую ночь в 03:30 делает копию базы в `/var/lib/saywed/backups` (хранится 30 дней) и удаляет отказные заявки старше 12 месяцев — этот срок обещан в `/privacy`. Чтобы копия уходила с сервера, настроить `rclone` (Yandex Object Storage / Selectel S3) и добавить в `/etc/saywed/api.env`:

```
RCLONE_REMOTE=s3:saywed-backups
```

Проверить вручную: `systemctl start saywed-backup && ls -la /var/lib/saywed/backups`. Восстановление: остановить API, `gunzip` копию поверх `/var/lib/saywed/saywed.db` (удалив `-wal`/`-shm`), запустить API.

## Локальная разработка

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run dev:api        # API на :3000, база в apps/api/data/
npm run dev            # сайт на :4321, /api проксируется на API, форма включена
npm run dev:admin      # админка на :5173, /api проксируется на API
npm run cli -w @saywed/api -- create-user artyom "Артём"
```

Изменили схему в `apps/api/src/db/schema.ts` → `npm run db:generate -w @saywed/api` → закоммитить новый файл из `apps/api/drizzle/`. Миграции применяются при старте API.
