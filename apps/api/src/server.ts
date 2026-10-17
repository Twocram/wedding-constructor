import process from 'node:process'
import { app } from './app'
import { runMigrations, sqlite } from './db'
import { env } from './env'

export function startServer() {
  runMigrations()

  app.listen({ hostname: env.host, port: env.port }, ({ hostname, port }) => console.log(`[api] слушаю http://${hostname}:${port}`))

  const shutdown = async () => {
    await app.stop()
    sqlite.close()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}
