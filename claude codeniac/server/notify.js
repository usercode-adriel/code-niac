// Notificações em tempo real via Server-Sent Events.
import { db, id, now, save } from './db.js';

const clients = new Map(); // userId -> Set<res>

export function subscribe(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
  return () => clients.get(userId)?.delete(res);
}

export function emit(userId, event, data) {
  for (const res of clients.get(userId) || []) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

// Cria uma notificação respeitando as preferências do usuário.
export function notify(userId, { type = 'task', title, message, link = null }) {
  const d = db();
  const prefs = d.settings[userId] || {};
  if (type === 'task' && prefs.notifyTasks === false) return null;
  if ((type === 'system' || type === 'update') && prefs.notifySystem === false) return null;
  const n = { id: id(), userId, type, title, message, link, read: false, createdAt: now() };
  d.notifications.push(n);
  save();
  emit(userId, 'notification', n);
  return n;
}
