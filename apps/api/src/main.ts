// один исполняемый файл: без аргументов — API, с командой — служебный CLI (saywed-api create-user …)
import { runCli } from './cli';
import { startServer } from './server';

const args = process.argv.slice(2);

if (args.length) await runCli(args);
else startServer();
