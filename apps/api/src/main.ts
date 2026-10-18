// один исполняемый файл: без аргументов — API, с командой — служебный CLI (saywed-api create-user …)
import process from 'node:process'

const args = process.argv.slice(2)

// CLI не тянет за собой сервер: лимитеры, хеш-заглушку для входа и прочее
if (args.length)
  await (await import('./cli')).runCli(args)
else
  (await import('./server')).startServer()
