# Деплой

Сайт (`apps/site`) — статика в `/var/www/wedding`, как и раньше. API (`apps/api`) — один исполняемый файл (ElysiaJS, собран `bun build --compile`) под systemd за nginx, база SQLite в `/var/lib/saywed`. Админка (`apps/admin`) — статика в `/var/www/admin` на `admin.saywed.ru`, ходит в тот же API.

GitHub Actions (`.github/workflows/deploy.yml`) при пуше в main деплоит только изменившееся приложение. Задачи API и админки выключены, пока не выполнена первичная настройка ниже: их включают переменные репозитория `API_DEPLOY_ENABLED` и `ADMIN_DEPLOY_ENABLED`.

## Сайт на новом сервере

Сервер — Ubuntu 24.04, сейчас 94.154.11.166. Настройка под сайт одной командой (nginx, certbot, пользователь `deploy` с ключом CI, `/var/www/wedding`):

```bash
ssh root@<IP> "CI_PUBKEY='$(cat ~/.ssh/saywed_ci.pub)' bash -s" < deploy/setup-site.sh
```

Затем секреты репозитория `VPS_HOST`, `VPS_USER=deploy`, `VPS_SSH_KEY` (приватный `~/.ssh/saywed_ci`), A-записи `saywed.ru` и `www.saywed.ru` в reg.ru на IP сервера и, когда DNS обновится, сертификат:

```bash
certbot --nginx -d saywed.ru -d www.saywed.ru --non-interactive --agree-tos --register-unsafely-without-email --redirect
```

## Первичная настройка API и админки (один раз)

Команды — от root. `deploy` ниже — пользователь из секрета `VPS_USER`, под которым CI заходит по SSH.

### 1. Пользователь сервиса

Ни Node, ни Bun на сервер ставить не нужно: рантайм Bun встроен в сам файл `saywed-api`.

```bash
uname -m  # x86_64 — CI собирает под bun-linux-x64; для arm64 поменять --target в apps/api/package.json

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
nano /etc/saywed/api.env                      # IP_SALT
```

`PORT` оставить 3000: на него смотрят nginx-сниппет и проверка здоровья в CI.

### 3. systemd и права на перезапуск для CI

```bash
cp saywed-api.service saywed-backup.service saywed-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable saywed-api
systemctl enable --now saywed-backup.timer   # без --now таймер заработает только после перезагрузки

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
sudo -u saywed --preserve-env bash -c 'set -a; . /etc/saywed/api.env; ./saywed-api create-user artyom "Артём"'
```

Пароль выводится один раз. Сброс — `reset-password <login>`, список — `list-users`, последние заявки — `leads 20`.

### 7. Включить форму на сайте

Реквизиты оператора (самозанятый: ФИО и ИНН) — в `apps/site/src/site.ts` (`legal`), выводятся на `/privacy`; до запуска продаж заменить заглушки. Затем переменная репозитория `LEAD_FORM_ENABLED = true` и Run workflow (или любой пуш в сайт). Без неё кнопки «Заказать» ведут в Telegram, как раньше.

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

3. Переменная репозитория `ADMIN_DEPLOY_ENABLED = true` → Run workflow. Вход — логином и паролем из шага 6. Новые заявки — во вкладке «Новые» и в бейдже в шапке, список обновляется сам раз в минуту.

## Уведомления в Telegram

API пишет в бота о новых заявках и ответах гостей. С российского сервера `api.telegram.org` недоступен, поэтому запросы идут через воркер Cloudflare из `deploy/tg-relay`: он пропускает только отправку и приём сообщений и только с ключом.

1. Бот: @BotFather → `/newbot` → токен. Написать боту любое сообщение; chat id — из `getUpdates`.
2. Воркер (один раз, с локальной машины):

```bash
cd deploy/tg-relay
bunx wrangler login
bunx wrangler deploy                    # выведет https://saywed-tg-relay.<аккаунт>.workers.dev
KEY=$(openssl rand -hex 32); printf %s "$KEY" | bunx wrangler secret put RELAY_KEY; echo "TG_RELAY_KEY=$KEY"
```

3. В `/etc/saywed/api.env`: `TG_BOT_TOKEN`, `TG_CHAT_ID`, `TG_API_URL` (адрес воркера), `TG_RELAY_KEY` (тот же ключ) → `systemctl restart saywed-api`.

Воркер выкатывать раньше API: без `getUpdates` в воркере бот не видит Start. Webhook у бота не включать — он мешает `getUpdates`. Если ключ утёк, сменить сразу: с ним можно читать входящие боту.

Кто нажал Start в боте, попадает в админку → «Уведомления» и получает сообщения после одобрения; `TG_CHAT_ID` получает всё всегда.

Паре — ссылка на бота из карточки приглашения: по ней Start подключает чат сразу, без одобрения, и туда приходят только ответы гостей этого приглашения, без имён.

Имена и контакты в уведомление не попадают: это была бы передача ПД за рубеж. В сообщении только суть и ссылка в админку; `TG_NOTIFY_CONTACTS=true` включает подробности.

## Бэкапы

`saywed-backup.timer` каждую ночь в 03:30 делает копию базы в `/var/lib/saywed/backups` (хранится 30 дней) и удаляет отказные заявки старше 12 месяцев — этот срок обещан в `/privacy`. Чтобы копия уходила с сервера, настроить `rclone` (Yandex Object Storage / Selectel S3) и добавить в `/etc/saywed/api.env`:

```
RCLONE_REMOTE=s3:saywed-backups
```

Проверить вручную: `systemctl start saywed-backup && ls -la /var/lib/saywed/backups`. Восстановление: остановить API, `gunzip` копию поверх `/var/lib/saywed/saywed.db` (удалив `-wal`/`-shm`), запустить API.

## Локальная разработка

```bash
bun install
cp apps/api/.env.example apps/api/.env   # Bun читает .env сам
bun run dev:api        # API на :3000, база в apps/api/data/
bun run dev            # сайт на :4321, /api проксируется на API, форма включена
bun run dev:admin      # админка на :5173, /api проксируется на API
bun --filter @saywed/api cli create-user artyom "Артём"
bun run lint           # ESLint (@antfu/eslint-config); bun run lint:fix — исправить и отформатировать
```

Изменили схему в `apps/api/src/db/schema.ts` → `bun --filter @saywed/api db:generate` → закоммитить новый файл из `apps/api/drizzle/`. Миграции применяются при старте API.
