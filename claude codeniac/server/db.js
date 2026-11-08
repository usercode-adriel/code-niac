// Armazenamento em arquivo JSON com escrita atômica.
// Simples, sem dependências nativas, ideal para um hub pessoal.
// Para escalar, troque este módulo por SQLite/Postgres mantendo a mesma API.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Raiz do app calculada a partir deste arquivo: funciona mesmo iniciado por atalho/instalador.
export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.resolve(APP_ROOT, process.env.DATA_DIR || 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = () => ({
  meta: {},
  users: [],
  settings: {},       // userId -> objeto de configurações
  projects: [],
  tasks: [],
  notes: [],
  links: [],
  notifications: [],
  threads: {},        // userId -> { api: [...mensagens da API], display: [...] }
});

let state = null;
let timer = null;

export function load() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    state = { ...EMPTY(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } else {
    state = EMPTY();
  }
  return state;
}

export function db() {
  if (!state) load();
  return state;
}

function flush() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, FILE);
}

// Agrupa várias alterações em uma única escrita.
export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 40);
}

export function saveNow() {
  clearTimeout(timer);
  flush();
}

export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

export function slugify(str) {
  return String(str)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 40) || 'projeto';
}
