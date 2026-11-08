// Primeiro módulo carregado pelo servidor.
// 1) Aceita configurações por argumento (usado pelo atalho do Windows):
//      node server/index.js --data-dir=C:\...\Codeniac --port=3000 --log-file=C:\...\codeniac.log
// 2) Lê o .env da pasta de dados, se existir.
// 3) Quando há --log-file / LOG_FILE (app iniciado sem terminal), grava os logs em arquivo.
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

const ARGS = { '--data-dir': 'DATA_DIR', '--port': 'PORT', '--log-file': 'LOG_FILE' };
for (const arg of process.argv.slice(2)) {
  const [flag, ...rest] = arg.split('=');
  if (ARGS[flag] && rest.length) process.env[ARGS[flag]] = rest.join('=');
}

// Carrega <pasta de dados>/.env (ex.: ANTHROPIC_API_KEY) sem depender de flags do Node.
if (process.env.DATA_DIR) {
  const envFile = path.join(process.env.DATA_DIR, '.env');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
}

if (process.env.LOG_FILE) {
  fs.mkdirSync(path.dirname(process.env.LOG_FILE), { recursive: true });
  const out = fs.createWriteStream(process.env.LOG_FILE, { flags: 'a' });
  const write = (level) => (...args) => out.write(`[${new Date().toISOString()}] ${level} ${util.format(...args)}\n`);
  console.log = write('INFO ');
  console.error = write('ERROR');
  process.on('uncaughtException', (err) => { console.error(err); setTimeout(() => process.exit(1), 100); });
}
