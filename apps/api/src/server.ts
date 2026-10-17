import { serve } from '@hono/node-server';
import { app } from './app';
import { runMigrations, sqlite } from './db';
import { env } from './env';

runMigrations();

const server = serve({ fetch: app.fetch, hostname: env.host, port: env.port }, (info) =>
  console.log(`[api] слушаю http://${info.address}:${info.port}`),
);

const shutdown = () => {
  server.close(() => {
    sqlite.close();
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
