import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import multer from 'multer';
import { db, id, now, save, slugify, UPLOAD_DIR } from '../db.js';
import {
  requireAuth, requireAdmin, signToken, verifyPassword, hashPassword, publicUser,
} from '../auth.js';
import { createUser, DEFAULT_SETTINGS, APP_VERSION, CHANGELOG } from '../seed.js';
import { notify, subscribe, emit } from '../notify.js';

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const PRIORITIES = ['low', 'medium', 'high'];
const STATUSES = ['todo', 'doing', 'done'];
const ICONS = ['briefcase', 'code', 'bitcoin', 'trending', 'book', 'layers', 'globe', 'folder',
  'star', 'heart', 'music', 'camera', 'rocket', 'target', 'cpu', 'pen'];

// ---------- Upload de imagens ----------
const MIME_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${id()}${MIME_EXT[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    MIME_EXT[file.mimetype] ? cb(null, true) : cb(new Error('Formato inválido. Use PNG, JPG, WEBP ou GIF.')),
});
const single = (field) => (req, res, next) =>
  upload.single(field)(req, res, (err) => (err ? bad(res, err.code === 'LIMIT_FILE_SIZE' ? 'Imagem acima de 5 MB' : err.message) : next()));

function removeUpload(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const file = path.join(UPLOAD_DIR, path.basename(url));
  fs.rm(file, { force: true }, () => {});
}

// ---------- Helpers de domínio ----------
const userProjects = (uid) => db().projects.filter((p) => p.userId === uid).sort((a, b) => a.order - b.order);
const userTasks = (uid) => db().tasks.filter((t) => t.userId === uid);
const findOwned = (coll, itemId, uid) => db()[coll].find((x) => x.id === itemId && x.userId === uid);

export function projectStats(projectId, uid) {
  const tasks = userTasks(uid).filter((t) => t.projectId === projectId);
  const done = tasks.filter((t) => t.status === 'done').length;
  return {
    total: tasks.length, done,
    doing: tasks.filter((t) => t.status === 'doing').length,
    todo: tasks.filter((t) => t.status === 'todo').length,
    progress: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
  };
}
const withStats = (p, uid) => ({ ...p, stats: projectStats(p.id, uid) });

// Usado pelo atalho do Windows para saber se o app já está rodando.
router.get('/health', (_req, res) => res.json({ app: 'codeniac', version: APP_VERSION }));

// ---------- Autenticação ----------
router.post('/auth/register', wrap(async (req, res) => {
  const name = str(req.body.name, 80);
  const email = str(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return bad(res, 'Informe nome e e-mail válidos');
  if (password.length < 6) return bad(res, 'A senha precisa de pelo menos 6 caracteres');
  if (db().users.some((u) => u.email === email)) return bad(res, 'E-mail já cadastrado', 409);
  const user = createUser({ name, email, password });
  user.lastSeenVersion = APP_VERSION;
  save();
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

router.post('/auth/login', wrap(async (req, res) => {
  const email = str(req.body.email, 120).toLowerCase();
  const user = db().users.find((u) => u.email === email);
  if (!user || !verifyPassword(String(req.body.password || ''), user.password)) {
    return bad(res, 'E-mail ou senha incorretos', 401);
  }
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.use(requireAuth);

router.get('/auth/me', (req, res) => {
  res.json({
    user: publicUser(req.user),
    settings: { ...DEFAULT_SETTINGS, ...(db().settings[req.user.id] || {}) },
    version: APP_VERSION,
  });
});

// ---------- Perfil ----------
router.put('/profile', (req, res) => {
  const u = req.user;
  const name = str(req.body.name, 80);
  const email = str(req.body.email, 120).toLowerCase();
  if (!name) return bad(res, 'Nome é obrigatório');
  if (email && email !== u.email) {
    if (!/^\S+@\S+\.\S+$/.test(email)) return bad(res, 'E-mail inválido');
    if (db().users.some((x) => x.email === email)) return bad(res, 'E-mail já em uso', 409);
    u.email = email;
  }
  u.name = name;
  u.bio = str(req.body.bio, 400);
  u.title = str(req.body.title, 60) || 'Membro';
  save();
  res.json({ user: publicUser(u) });
});

router.put('/profile/password', (req, res) => {
  const { current, next: nextPwd } = req.body;
  if (!verifyPassword(String(current || ''), req.user.password)) return bad(res, 'Senha atual incorreta', 401);
  if (String(nextPwd || '').length < 6) return bad(res, 'A nova senha precisa de pelo menos 6 caracteres');
  req.user.password = hashPassword(String(nextPwd));
  save();
  notify(req.user.id, { type: 'system', title: 'Senha alterada', message: 'Sua senha foi atualizada com sucesso.' });
  res.json({ ok: true });
});

router.post('/profile/avatar', single('image'), (req, res) => {
  if (!req.file) return bad(res, 'Nenhuma imagem enviada');
  removeUpload(req.user.avatar);
  req.user.avatar = `/uploads/${req.file.filename}`;
  save();
  res.json({ user: publicUser(req.user) });
});

router.delete('/profile/avatar', (req, res) => {
  removeUpload(req.user.avatar);
  req.user.avatar = null;
  save();
  res.json({ user: publicUser(req.user) });
});

// ---------- Configurações ----------
router.get('/settings', (req, res) => {
  res.json({ ...DEFAULT_SETTINGS, ...(db().settings[req.user.id] || {}) });
});

router.put('/settings', (req, res) => {
  const current = { ...DEFAULT_SETTINGS, ...(db().settings[req.user.id] || {}) };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!(key in req.body)) continue;
    const v = req.body[key];
    if (typeof DEFAULT_SETTINGS[key] === 'boolean') current[key] = Boolean(v);
    else if (key === 'accent') { if (/^#[0-9a-f]{6}$/i.test(v)) current.accent = v; }
    else if (key === 'density') { if (['comfortable', 'compact'].includes(v)) current.density = v; }
    else current[key] = str(v, 40) || DEFAULT_SETTINGS[key];
  }
  db().settings[req.user.id] = current;
  save();
  res.json(current);
});

// ---------- Projetos ----------
router.get('/projects', (req, res) => {
  res.json(userProjects(req.user.id).map((p) => withStats(p, req.user.id)));
});

router.get('/projects/:slug', (req, res) => {
  const uid = req.user.id;
  const p = userProjects(uid).find((x) => x.slug === req.params.slug || x.id === req.params.slug);
  if (!p) return bad(res, 'Projeto não encontrado', 404);
  res.json({
    ...withStats(p, uid),
    tasks: userTasks(uid).filter((t) => t.projectId === p.id),
    notes: db().notes.filter((n) => n.projectId === p.id && n.userId === uid)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    links: db().links.filter((l) => l.projectId === p.id && l.userId === uid),
  });
});

router.post('/projects', (req, res) => {
  const uid = req.user.id;
  const name = str(req.body.name, 60);
  if (!name) return bad(res, 'Nome do projeto é obrigatório');
  let slug = slugify(name);
  const taken = new Set(userProjects(uid).map((p) => p.slug));
  for (let i = 2; taken.has(slug); i++) slug = `${slugify(name)}-${i}`;
  const p = {
    id: id(), userId: uid, slug, name,
    icon: ICONS.includes(req.body.icon) ? req.body.icon : 'folder',
    color: /^#[0-9a-f]{6}$/i.test(req.body.color) ? req.body.color : '#1f8fff',
    tagline: str(req.body.tagline, 60), description: str(req.body.description, 300),
    cover: null, favorite: false, order: userProjects(uid).length, createdAt: now(), updatedAt: now(),
  };
  db().projects.push(p);
  save();
  notify(uid, { type: 'task', title: 'Novo projeto criado', message: `"${name}" foi adicionado ao seu hub.`, link: `#/project/${slug}` });
  res.status(201).json(withStats(p, uid));
});

router.put('/projects/:id', (req, res) => {
  const p = findOwned('projects', req.params.id, req.user.id);
  if (!p) return bad(res, 'Projeto não encontrado', 404);
  if ('name' in req.body) p.name = str(req.body.name, 60) || p.name;
  if ('tagline' in req.body) p.tagline = str(req.body.tagline, 60);
  if ('description' in req.body) p.description = str(req.body.description, 300);
  if (ICONS.includes(req.body.icon)) p.icon = req.body.icon;
  if (/^#[0-9a-f]{6}$/i.test(req.body.color || '')) p.color = req.body.color;
  if ('favorite' in req.body) p.favorite = Boolean(req.body.favorite);
  p.updatedAt = now();
  save();
  res.json(withStats(p, req.user.id));
});

router.post('/projects/:id/cover', single('image'), (req, res) => {
  const p = findOwned('projects', req.params.id, req.user.id);
  if (!p) return bad(res, 'Projeto não encontrado', 404);
  if (!req.file) return bad(res, 'Nenhuma imagem enviada');
  removeUpload(p.cover);
  p.cover = `/uploads/${req.file.filename}`;
  p.updatedAt = now();
  save();
  res.json(withStats(p, req.user.id));
});

router.delete('/projects/:id/cover', (req, res) => {
  const p = findOwned('projects', req.params.id, req.user.id);
  if (!p) return bad(res, 'Projeto não encontrado', 404);
  removeUpload(p.cover);
  p.cover = null;
  save();
  res.json(withStats(p, req.user.id));
});

router.delete('/projects/:id', (req, res) => {
  const d = db();
  const p = findOwned('projects', req.params.id, req.user.id);
  if (!p) return bad(res, 'Projeto não encontrado', 404);
  removeUpload(p.cover);
  d.projects = d.projects.filter((x) => x.id !== p.id);
  d.tasks = d.tasks.filter((x) => x.projectId !== p.id);
  d.notes = d.notes.filter((x) => x.projectId !== p.id);
  d.links = d.links.filter((x) => x.projectId !== p.id);
  save();
  res.json({ ok: true });
});

// ---------- Tarefas ----------
export function createTask(uid, body) {
  const project = findOwned('projects', body.projectId, uid);
  if (!project) throw Object.assign(new Error('Projeto inválido'), { status: 400 });
  const title = str(body.title, 160);
  if (!title) throw Object.assign(new Error('Título é obrigatório'), { status: 400 });
  const t = {
    id: id(), userId: uid, projectId: project.id, title,
    description: str(body.description, 2000),
    status: STATUSES.includes(body.status) ? body.status : 'todo',
    priority: PRIORITIES.includes(body.priority) ? body.priority : 'medium',
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate || '') ? body.dueDate : null,
    createdAt: now(), updatedAt: now(), completedAt: null,
  };
  if (t.status === 'done') t.completedAt = now();
  db().tasks.push(t);
  save();
  emit(uid, 'data', { kind: 'task' });
  return t;
}

export function updateTask(uid, taskId, body) {
  const t = findOwned('tasks', taskId, uid);
  if (!t) throw Object.assign(new Error('Tarefa não encontrada'), { status: 404 });
  const wasDone = t.status === 'done';
  if ('title' in body) t.title = str(body.title, 160) || t.title;
  if ('description' in body) t.description = str(body.description, 2000);
  if (STATUSES.includes(body.status)) t.status = body.status;
  if (PRIORITIES.includes(body.priority)) t.priority = body.priority;
  if ('dueDate' in body) t.dueDate = /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate || '') ? body.dueDate : null;
  if (body.projectId && findOwned('projects', body.projectId, uid)) t.projectId = body.projectId;
  t.updatedAt = now();
  if (!wasDone && t.status === 'done') {
    t.completedAt = now();
    const p = findOwned('projects', t.projectId, uid);
    const st = projectStats(t.projectId, uid);
    notify(uid, {
      type: 'task', title: 'Tarefa concluída ✅',
      message: `"${t.title}" em ${p?.name}. Progresso do projeto: ${st.progress}%.`,
      link: p ? `#/project/${p.slug}` : null,
    });
  } else if (t.status !== 'done') t.completedAt = null;
  save();
  emit(uid, 'data', { kind: 'task' });
  return t;
}

router.get('/tasks', (req, res) => {
  let list = userTasks(req.user.id);
  const { projectId, status, priority, q } = req.query;
  if (projectId) list = list.filter((t) => t.projectId === projectId);
  if (status) list = list.filter((t) => t.status === status);
  if (priority) list = list.filter((t) => t.priority === priority);
  if (q) list = list.filter((t) => t.title.toLowerCase().includes(String(q).toLowerCase()));
  res.json(list.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')));
});

router.post('/tasks', (req, res) => {
  try { res.status(201).json(createTask(req.user.id, req.body)); }
  catch (e) { bad(res, e.message, e.status || 400); }
});

router.put('/tasks/:id', (req, res) => {
  try { res.json(updateTask(req.user.id, req.params.id, req.body)); }
  catch (e) { bad(res, e.message, e.status || 400); }
});

router.delete('/tasks/:id', (req, res) => {
  const d = db();
  const t = findOwned('tasks', req.params.id, req.user.id);
  if (!t) return bad(res, 'Tarefa não encontrada', 404);
  d.tasks = d.tasks.filter((x) => x.id !== t.id);
  save();
  res.json({ ok: true });
});

// ---------- Notas (conteúdo) ----------
router.post('/notes', (req, res) => {
  const p = findOwned('projects', req.body.projectId, req.user.id);
  if (!p) return bad(res, 'Projeto inválido');
  const n = {
    id: id(), userId: req.user.id, projectId: p.id,
    title: str(req.body.title, 120) || 'Sem título', content: str(req.body.content, 20000),
    pinned: false, createdAt: now(), updatedAt: now(),
  };
  db().notes.push(n);
  save();
  res.status(201).json(n);
});

router.put('/notes/:id', (req, res) => {
  const n = findOwned('notes', req.params.id, req.user.id);
  if (!n) return bad(res, 'Nota não encontrada', 404);
  if ('title' in req.body) n.title = str(req.body.title, 120) || 'Sem título';
  if ('content' in req.body) n.content = str(req.body.content, 20000);
  if ('pinned' in req.body) n.pinned = Boolean(req.body.pinned);
  n.updatedAt = now();
  save();
  res.json(n);
});

router.delete('/notes/:id', (req, res) => {
  const d = db();
  if (!findOwned('notes', req.params.id, req.user.id)) return bad(res, 'Nota não encontrada', 404);
  d.notes = d.notes.filter((x) => x.id !== req.params.id);
  save();
  res.json({ ok: true });
});

// ---------- Links / recursos ----------
router.post('/links', (req, res) => {
  const p = findOwned('projects', req.body.projectId, req.user.id);
  if (!p) return bad(res, 'Projeto inválido');
  const url = str(req.body.url, 500);
  if (!/^https?:\/\//i.test(url)) return bad(res, 'Informe uma URL começando com http(s)://');
  const l = { id: id(), userId: req.user.id, projectId: p.id, title: str(req.body.title, 120) || url, url, createdAt: now() };
  db().links.push(l);
  save();
  res.status(201).json(l);
});

router.delete('/links/:id', (req, res) => {
  const d = db();
  if (!findOwned('links', req.params.id, req.user.id)) return bad(res, 'Link não encontrado', 404);
  d.links = d.links.filter((x) => x.id !== req.params.id);
  save();
  res.json({ ok: true });
});

// ---------- Uploads genéricos (ex.: imagens em notas) ----------
router.post('/uploads', single('image'), (req, res) => {
  if (!req.file) return bad(res, 'Nenhuma imagem enviada');
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});

// ---------- Notificações ----------
router.get('/notifications', (req, res) => {
  const list = db().notifications.filter((n) => n.userId === req.user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ items: list, unread: list.filter((n) => !n.read).length });
});

router.get('/notifications/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('event: ready\ndata: {}\n\n');
  const off = subscribe(req.user.id, res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); off(); });
});

router.put('/notifications/read-all', (req, res) => {
  db().notifications.forEach((n) => { if (n.userId === req.user.id) n.read = true; });
  save();
  res.json({ ok: true });
});

router.put('/notifications/:id/read', (req, res) => {
  const n = findOwned('notifications', req.params.id, req.user.id);
  if (!n) return bad(res, 'Notificação não encontrada', 404);
  n.read = req.body.read !== false;
  save();
  res.json(n);
});

router.delete('/notifications/:id', (req, res) => {
  const d = db();
  d.notifications = d.notifications.filter((n) => !(n.id === req.params.id && n.userId === req.user.id));
  save();
  res.json({ ok: true });
});

// Admin publica uma atualização do sistema para todos os usuários.
router.post('/notifications/broadcast', requireAdmin, (req, res) => {
  const title = str(req.body.title, 120);
  const message = str(req.body.message, 1000);
  if (!title || !message) return bad(res, 'Título e mensagem são obrigatórios');
  let count = 0;
  for (const u of db().users) if (notify(u.id, { type: 'update', title, message })) count++;
  res.json({ ok: true, delivered: count });
});

router.get('/changelog', (_req, res) => res.json({ version: APP_VERSION, entries: [...CHANGELOG].reverse() }));

// ---------- Dashboard & busca ----------
router.get('/dashboard', (req, res) => {
  const uid = req.user.id;
  const projects = userProjects(uid).map((p) => withStats(p, uid));
  const tasks = userTasks(uid);
  const today = new Date().toISOString().slice(0, 10);
  const open = tasks.filter((t) => t.status !== 'done');
  const byProject = Object.fromEntries(projects.map((p) => [p.id, p]));
  const decorate = (t) => ({ ...t, project: { name: byProject[t.projectId]?.name, slug: byProject[t.projectId]?.slug, color: byProject[t.projectId]?.color, icon: byProject[t.projectId]?.icon } });
  const notifications = db().notifications.filter((n) => n.userId === uid)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const done = tasks.filter((t) => t.status === 'done').length;
  res.json({
    projects,
    totals: {
      projects: projects.length, tasks: tasks.length, done,
      open: open.length, overdue: open.filter((t) => t.dueDate && t.dueDate < today).length,
      progress: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    },
    upcoming: open.filter((t) => t.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6).map(decorate),
    focus: open.filter((t) => t.priority === 'high').slice(0, 4).map(decorate),
    latestUpdate: notifications.find((n) => n.type === 'update') || null,
    recentNotes: db().notes.filter((n) => n.userId === uid).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3),
  });
});

router.get('/search', (req, res) => {
  const q = str(req.query.q, 80).toLowerCase();
  if (!q) return res.json({ projects: [], tasks: [], notes: [] });
  const uid = req.user.id;
  const projects = userProjects(uid);
  const pname = Object.fromEntries(projects.map((p) => [p.id, p]));
  res.json({
    projects: projects.filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(q)).slice(0, 5),
    tasks: userTasks(uid).filter((t) => t.title.toLowerCase().includes(q)).slice(0, 8)
      .map((t) => ({ ...t, projectSlug: pname[t.projectId]?.slug, projectName: pname[t.projectId]?.name })),
    notes: db().notes.filter((n) => n.userId === uid && `${n.title} ${n.content}`.toLowerCase().includes(q)).slice(0, 5)
      .map((n) => ({ ...n, projectSlug: pname[n.projectId]?.slug })),
  });
});

// ---------- Exportação de dados ----------
router.get('/export', (req, res) => {
  const uid = req.user.id;
  const d = db();
  const mine = (coll) => d[coll].filter((x) => x.userId === uid);
  res.set('Content-Disposition', `attachment; filename="codeniac-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({
    exportedAt: now(), version: APP_VERSION, user: publicUser(req.user), settings: d.settings[uid],
    projects: mine('projects'), tasks: mine('tasks'), notes: mine('notes'), links: mine('links'),
  });
});

export default router;
