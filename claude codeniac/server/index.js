import './runtime.js'; // precisa ser o primeiro import
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { load, saveNow, UPLOAD_DIR, APP_ROOT, DATA_DIR } from './db.js';
import { bootstrap } from './seed.js';
import { requireAuth } from './auth.js';
import api from './routes/api.js';
import { chat, getThread, clearThread, assistantMode } from './assistant.js';

load();
bootstrap();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(APP_ROOT, 'public');

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((_req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
  next();
});

// Assistente IA (resposta em streaming SSE sobre POST)
app.get('/api/assistant/status', requireAuth, (_req, res) => res.json({ mode: assistantMode() }));
app.get('/api/assistant/history', requireAuth, (req, res) => res.json(getThread(req.user.id).display));
app.delete('/api/assistant/history', requireAuth, (req, res) => { clearThread(req.user.id); res.json({ ok: true }); });
app.post('/api/assistant/chat', requireAuth, async (req, res) => {
  const text = typeof req.body.message === 'string' ? req.body.message.trim().slice(0, 4000) : '';
  if (!text) return res.status(400).json({ error: 'Mensagem vazia' });
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const write = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  try {
    await chat(req.user, text, write);
    write({ type: 'done' });
  } catch (err) {
    console.error('[assistente]', err);
    write({ type: 'error', text: 'Não consegui responder agora. Tente novamente.' });
  }
  res.end();
});

// Encerramento local seguro (usado pelo atalho "Parar Codeniac"): só aceita chamadas da própria
// máquina e com o token gravado na pasta de dados a cada início.
const CONTROL_TOKEN = crypto.randomBytes(24).toString('hex');
const TOKEN_FILE = path.join(DATA_DIR, '.control-token');
fs.writeFileSync(TOKEN_FILE, CONTROL_TOKEN);
app.post('/api/system/shutdown', (req, res) => {
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  const given = Buffer.from(String(req.get('x-codeniac-control') || ''));
  const ok = local && given.length === CONTROL_TOKEN.length && crypto.timingSafeEqual(given, Buffer.from(CONTROL_TOKEN));
  if (!ok) return res.status(403).json({ error: 'Proibido' });
  res.json({ ok: true });
  console.log('» Encerrado pelo atalho "Parar Codeniac".');
  setTimeout(shutdown, 100);
});

app.use('/api', api);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false }));
app.use(express.static(PUBLIC, { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Erro interno do servidor' });
});

// Só escuta na máquina local (127.0.0.1): ninguém da rede acessa seus dados.
const HOST = process.env.HOST || '127.0.0.1';
const server = app.listen(PORT, HOST, () => {
  console.log(`» Codeniac rodando em http://localhost:${PORT}  (assistente: ${assistantMode()})`);
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`» A porta ${PORT} já está em uso. O Codeniac provavelmente já está aberto.`);
  else console.error(err);
  process.exit(1);
});

function shutdown() {
  saveNow();
  fs.rmSync(TOKEN_FILE, { force: true });
  server.close();
  process.exit(0);
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, shutdown);
