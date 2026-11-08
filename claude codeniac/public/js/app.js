// Shell do Codeniac: autenticação, layout, roteador, busca, notificações e assistente.
import { api, auth, streamChat } from './api.js';
import { icon } from './icons.js';
import { $, $$, esc, avatar, timeAgo, toast, chatMd, notifIcon } from './ui.js';
import { store, on, emit, refreshProjects, refreshUnread, setUser, applySettings } from './store.js';
import { openTaskModal, openProjectModal } from './components.js';

const routes = {
  dashboard: () => import('./views/dashboard.js'),
  project: () => import('./views/project.js'),
  tasks: () => import('./views/tasks.js'),
  notifications: () => import('./views/notifications.js'),
  achievements: () => import('./views/achievements.js'),
  profile: () => import('./views/profile.js'),
  settings: () => import('./views/settings.js'),
};

// ---------- Boot ----------
async function boot() {
  if (!auth.token) { location.href = '/login'; return; }
  try {
    const me = await api.get('/auth/me');
    store.version = me.version;
    setUser(me.user);
    applySettings(me.settings);
    await Promise.all([refreshProjects(), refreshUnread()]);
    store.aiMode = (await api.get('/assistant/status')).mode;
  } catch (err) {
    console.error(err);
    return;
  }
  renderStaticIcons();
  renderSidebar();
  renderTopAvatar();
  renderAssistant();
  bindTopbar();
  connectStream();
  on('projects', renderSidebar);
  on('user', () => { renderSidebar(); renderTopAvatar(); });
  on('unread', renderBell);
  on('settings', renderAssistantHeader);
  window.addEventListener('hashchange', route);
  route();
}

function renderStaticIcons() {
  $('#menuBtn').innerHTML = icon('menu', 18);
  $('#searchIco').innerHTML = icon('search', 16);
  $('#voiceBtn').innerHTML = icon('mic', 15);
  $('#quickAddBtn').innerHTML = icon('plus', 18);
  $('#assistantToggle').innerHTML = icon('sparkles', 17);
  renderBell();
}

// ---------- Roteador ----------
let currentCleanup = null;
async function route() {
  const hash = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [name, ...params] = hash.split('/');
  const loader = routes[name] || routes.dashboard;
  document.body.classList.remove('sidebar-open', 'assistant-open');
  highlightNav(name, params[0]);
  const el = $('#content');
  currentCleanup?.();
  currentCleanup = null;
  el.innerHTML = '<div class="skeleton" style="height:250px;margin-bottom:20px"></div><div class="skeleton" style="height:180px"></div>';
  el.scrollTop = 0;
  try {
    const mod = await loader();
    const view = document.createElement('div');
    view.className = 'view';
    const cleanup = await mod.render(view, params.map(decodeURIComponent));
    el.replaceChildren(view);
    currentCleanup = typeof cleanup === 'function' ? cleanup : null;
  } catch (err) {
    console.error(err);
    el.innerHTML = `<div class="empty-state"><div class="e-ico">${icon('x', 22)}</div><b>${esc(err.message)}</b><p><a class="btn primary" href="#/dashboard">Voltar ao Dashboard</a></p></div>`;
  }
}

function highlightNav(name, param) {
  $$('.nav-item[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  $$('.project-link[data-slug]').forEach((a) => a.classList.toggle('active', name === 'project' && a.dataset.slug === param));
}

// ---------- Sidebar ----------
let favOpen = false;
let projectsOpen = true;
function renderSidebar() {
  const u = store.user;
  const favs = store.projects.filter((p) => p.favorite);
  const projLink = (p) => `<a class="project-link" data-slug="${p.slug}" href="#/project/${p.slug}">
      <span class="mini-ico" style="--c:${p.color}">${icon(p.icon, 12)}</span><span>${esc(p.name)}</span>
      <span class="count">${p.stats.todo + p.stats.doing || ''}</span></a>`;
  $('#sidebar').innerHTML = `
    <a class="brand" href="#/dashboard"><img class="brand-logo" src="/assets/logo.svg" alt=""><div>Codeniac<small>Project Hub</small></div></a>
    <nav class="nav">
      <a class="nav-item" data-route="dashboard" href="#/dashboard">${icon('dashboard', 17)} Dashboard</a>
      <a class="nav-item" data-route="notifications" href="#/notifications">${icon('news', 17)} Atualizações
        ${store.unread ? `<span class="nav-badge">${store.unread}</span>` : ''}</a>
      <a class="nav-item" data-route="tasks" href="#/tasks">${icon('tasks', 17)} Minhas tarefas</a>
      <button class="nav-item" id="favToggle" aria-expanded="${favOpen}">${icon('heart', 17)} Favoritos ${icon('chevDown', 14, 'class="svg-ico chev"')}</button>
      <div class="nav-sub ${favOpen ? 'open' : ''}" id="favList">${favs.length ? favs.map(projLink).join('') : '<span class="project-link muted">Nenhum favorito</span>'}</div>
      <a class="nav-item" data-route="achievements" href="#/achievements">${icon('trophy', 17)} Conquistas</a>
      <a class="nav-item" data-route="settings" href="#/settings">${icon('settings', 17)} Configurações</a>
    </nav>
    <div class="nav-section">
      <button class="nav-section-title" id="projToggle" aria-expanded="${projectsOpen}">${icon('users', 17)} Projetos ${icon(projectsOpen ? 'chevDown' : 'chevRight', 14, 'class="svg-ico chev"')}</button>
      <div class="nav-sub ${projectsOpen ? 'open' : ''}">
        ${store.projects.map(projLink).join('')}
        <a class="project-link add" href="#" id="newProjectLink"><span class="mini-ico">${icon('plus', 12)}</span>Novo projeto</a>
      </div>
    </div>
    <div class="profile-card">
      ${avatar(u, 'lg')}
      <div class="name">${esc(u.name)}</div>
      <div class="role">${esc(u.title || 'Membro')}${u.role === 'admin' ? ' · Admin' : ''}</div>
      <button class="btn white sm" id="logoutBtn">${icon('logout', 13)} Sair</button>
    </div>`;
  $('#favToggle').onclick = () => { favOpen = !favOpen; renderSidebar(); };
  $('#projToggle').onclick = () => { projectsOpen = !projectsOpen; renderSidebar(); };
  $('#newProjectLink').onclick = async (e) => {
    e.preventDefault();
    const p = await openProjectModal();
    if (p) location.hash = `#/project/${p.slug}`;
  };
  $('#logoutBtn').onclick = logout;
  const hash = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [name, param] = hash.split('/');
  highlightNav(name, param);
}

function logout() {
  auth.clear();
  location.href = '/login';
}

function renderTopAvatar() {
  $('#topAvatar').innerHTML = avatar(store.user, 'ring');
}

// ---------- Topbar: busca, voz, notificações ----------
function bindTopbar() {
  $('#menuBtn').onclick = () => document.body.classList.toggle('sidebar-open');
  $('#overlay').onclick = () => document.body.classList.remove('sidebar-open', 'assistant-open');
  $('#assistantToggle').onclick = () => {
    document.body.classList.toggle('assistant-open');
    if (document.body.classList.contains('assistant-open')) setTimeout(() => $('#chatInput')?.focus(), 250);
  };
  $('#quickAddBtn').onclick = () => {
    const m = location.hash.match(/#\/project\/([^/]+)/);
    const p = m && store.projects.find((x) => x.slug === m[1]);
    openTaskModal(null, { projectId: p?.id || store.projects[0]?.id });
  };

  // Busca global com debounce + navegação por teclado
  const input = $('#searchInput');
  const box = $('#searchResults');
  let timer;
  let hl = -1;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { box.classList.remove('open'); return; }
    timer = setTimeout(async () => {
      const r = await api.get(`/search?q=${encodeURIComponent(q)}`);
      const sec = (title, items) => (items ? `<h6>${title}</h6>${items}` : '');
      const html =
        sec('Projetos', r.projects.map((p) => `<a href="#/project/${p.slug}"><span class="mini-ico" style="--c:${p.color}">${icon(p.icon, 12)}</span>${esc(p.name)}</a>`).join('')) +
        sec('Tarefas', r.tasks.map((t) => `<a href="#/project/${t.projectSlug}">${icon(t.status === 'done' ? 'check' : 'tasks', 14)}<span>${esc(t.title)} <span class="muted">· ${esc(t.projectName)}</span></span></a>`).join('')) +
        sec('Notas', r.notes.map((n) => `<a href="#/project/${n.projectSlug}/notes">${icon('note', 14)}${esc(n.title)}</a>`).join(''));
      box.innerHTML = html || '<div class="empty">Nada encontrado</div>';
      box.classList.add('open');
      hl = -1;
    }, 180);
  });
  input.addEventListener('keydown', (e) => {
    const links = $$('a', box);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      hl = (hl + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
      links.forEach((l, i) => l.classList.toggle('hl', i === hl));
    } else if (e.key === 'Enter' && links[hl >= 0 ? hl : 0]) {
      location.hash = links[hl >= 0 ? hl : 0].getAttribute('href');
      closeSearch();
    } else if (e.key === 'Escape') closeSearch();
  });
  box.addEventListener('click', (e) => { if (e.target.closest('a')) closeSearch(); });
  function closeSearch() { box.classList.remove('open'); input.value = ''; input.blur(); }

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search')) box.classList.remove('open');
    if (!e.target.closest('#bellBtn') && !e.target.closest('#notifDropdown')) $('#notifDropdown').classList.remove('open');
  });

  // Pesquisa por voz (Web Speech API, quando disponível)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  $('#voiceBtn').onclick = () => {
    if (!SR) { toast('Voz indisponível', 'Seu navegador não suporta reconhecimento de voz.', 'error'); return; }
    const rec = new SR();
    rec.lang = 'pt-BR';
    $('#voiceBtn').classList.add('listening');
    rec.onresult = (ev) => { input.value = ev.results[0][0].transcript; input.dispatchEvent(new Event('input')); input.focus(); };
    rec.onend = () => $('#voiceBtn').classList.remove('listening');
    rec.start();
  };

  $('#bellBtn').onclick = toggleNotifDropdown;
}

function renderBell() {
  $('#bellBtn').innerHTML = icon('bell', 17) + (store.unread ? `<span class="dot">${store.unread > 9 ? '9+' : store.unread}</span>` : '');
  const badge = $('.nav-item[data-route="notifications"] .nav-badge');
  if (badge) badge.textContent = store.unread; else if (store.unread) renderSidebar();
}

async function toggleNotifDropdown() {
  const dd = $('#notifDropdown');
  if (dd.classList.toggle('open')) {
    const { items } = await api.get('/notifications');
    dd.innerHTML = `<div class="d-head"><b>Notificações</b><button class="see-more" id="ddReadAll">Marcar todas como lidas</button></div>
      <div class="d-list">${items.slice(0, 8).map((n) => `
        <a class="notif ${n.type} ${n.read ? '' : 'unread'}" href="${n.link || '#/notifications'}" data-id="${n.id}">
          <div class="n-ico">${icon(notifIcon(n.type), 16)}</div>
          <div class="n-body"><h5>${esc(n.title)}</h5><p>${esc(n.message)}</p><time>${timeAgo(n.createdAt)}</time></div></a>`).join('') ||
        '<div class="empty-state">Sem notificações</div>'}</div>
      <a class="btn outline sm" style="width:100%;margin-top:8px" href="#/notifications">Ver todas</a>`;
    $('#ddReadAll').onclick = async () => { await api.put('/notifications/read-all'); await refreshUnread(); dd.classList.remove('open'); };
    $$('.notif[data-id]', dd).forEach((a) => a.addEventListener('click', async () => {
      dd.classList.remove('open');
      await api.put(`/notifications/${a.dataset.id}/read`); refreshUnread();
    }));
  }
}

// ---------- Tempo real (SSE) ----------
function connectStream() {
  const es = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(auth.token)}`);
  es.addEventListener('notification', (e) => {
    const n = JSON.parse(e.data);
    store.unread += 1;
    emit('unread', store.unread);
    emit('notification', n);
    toast(n.title, n.message, n.type === 'task' ? 'success' : 'info');
    if (store.settings.notifySound) beep();
  });
  es.addEventListener('data', () => { refreshProjects(); emit('tasks:changed'); });
  es.onerror = () => { /* o navegador reconecta automaticamente */ };
}

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 880; g.gain.setValueAtTime(0.06, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.25);
  } catch { /* sem áudio */ }
}

// ---------- Assistente IA (área "Library" da referência) ----------
const SUGGESTIONS = ['Resumo dos projetos', 'O que priorizar hoje?', 'Tarefas atrasadas', 'Planeje minha semana'];

function renderAssistant() {
  $('#assistant').innerHTML = `
    <div class="assistant-top">
      <a class="icon-btn" href="#/notifications" aria-label="Atualizações">${icon('news', 17)}</a>
      <a class="icon-btn" href="#/settings" aria-label="Configurações">${icon('settings', 17)}</a>
    </div>
    <section class="assistant-panel">
      <div class="assistant-head" id="assistantHead"></div>
      <div class="chat" id="chat" aria-live="polite"></div>
      <div class="suggestions" id="suggestions">${SUGGESTIONS.map((s) => `<button>${s}</button>`).join('')}</div>
      <form class="composer" id="composer">
        <input id="chatInput" placeholder="Digite uma mensagem" autocomplete="off" aria-label="Mensagem para o assistente" maxlength="4000">
        <button type="button" class="icon-btn sm ghost" id="chatMic" aria-label="Ditado por voz">${icon('mic', 15)}</button>
        <button class="icon-btn sm ghost" aria-label="Enviar">${icon('send', 15)}</button>
      </form>
    </section>`;
  renderAssistantHeader();
  on('projects', renderAssistantHeader);
  loadHistory();
  $('#composer').addEventListener('submit', (e) => { e.preventDefault(); sendChat($('#chatInput').value); });
  $('#suggestions').addEventListener('click', (e) => { if (e.target.matches('button')) sendChat(e.target.textContent); });
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  $('#chatMic').onclick = () => {
    if (!SR) { toast('Voz indisponível', 'Seu navegador não suporta ditado.', 'error'); return; }
    const rec = new SR(); rec.lang = 'pt-BR';
    $('#chatMic').classList.add('listening');
    rec.onresult = (ev) => { $('#chatInput').value = ev.results[0][0].transcript; $('#chatInput').focus(); };
    rec.onend = () => $('#chatMic').classList.remove('listening');
    rec.start();
  };
}

function renderAssistantHeader() {
  const head = $('#assistantHead');
  if (!head) return;
  const total = store.projects.reduce((a, p) => a + p.stats.total, 0);
  const done = store.projects.reduce((a, p) => a + p.stats.done, 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const name = store.settings.assistantName || 'Niac';
  head.innerHTML = `
    <h3>Assistente IA <span style="display:flex;gap:4px"><button class="icon-btn sm ghost" id="clearChat" aria-label="Limpar conversa" title="Limpar conversa">${icon('refresh', 14)}</button>
      <button class="icon-btn sm ghost assistant-close" id="closeAssistant" aria-label="Fechar assistente">${icon('x', 14)}</button></span></h3>
    <div class="lib-item">
      <div class="thumb" style="background:linear-gradient(135deg,#22c55e,#0e7490)">${icon('target', 18)}</div>
      <div class="info"><b>Progresso geral</b>
        <div class="row"><div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso geral"><span style="width:${pct}%"></span></div><span class="pct">${pct}%</span></div></div>
    </div>
    <div class="lib-item">
      <div class="thumb">${icon('bot', 18)}</div>
      <div class="info"><b>${esc(name)} · especialista</b><small><span class="online" style="${store.aiMode === 'claude' ? '' : 'background:var(--warn);box-shadow:0 0 8px var(--warn)'}"></span> ${store.aiMode === 'claude' ? 'Claude conectado' : 'Modo local'}</small></div>
      <div class="actions"><a class="icon-btn sm ghost" href="#/settings" aria-label="Configurar assistente">${icon('settings', 13)}</a></div>
    </div>
    <div class="divider-plus"><span>${icon('plus', 11)}</span></div>`;
  $('#closeAssistant').onclick = () => document.body.classList.remove('assistant-open');
  $('#clearChat').onclick = async () => {
    await api.del('/assistant/history');
    $('#chat').innerHTML = '';
    greet();
  };
}

function msgHtml(role, text, at) {
  const t = at ? new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  if (role === 'user') {
    return `<div class="msg me"><div class="who"><time>${t}</time><b>${esc(store.user.name.split(' ')[0])}</b>${avatar(store.user, '', 26)}</div><div class="bubble">${chatMd(text)}</div></div>`;
  }
  return `<div class="msg"><div class="who"><div class="avatar" style="--s:26px;background:linear-gradient(135deg,var(--accent),#6d28d9)">${icon('bot', 13)}</div>
    <div><b>${esc(store.settings.assistantName || 'Niac')}</b><small>Assistente</small></div><time>${t}</time></div><div class="bubble">${chatMd(text)}</div></div>`;
}

async function loadHistory() {
  const history = await api.get('/assistant/history');
  const chat = $('#chat');
  chat.innerHTML = history.map((m) => msgHtml(m.role, m.text, m.at)).join('');
  if (!history.length) greet();
  chat.scrollTop = chat.scrollHeight;
}

function greet() {
  const first = store.user.name.split(' ')[0];
  $('#chat').insertAdjacentHTML('beforeend', msgHtml('assistant',
    `Olá, ${first}! Sou o ${store.settings.assistantName || 'Niac'}, especialista do Codeniac. Posso resumir seus projetos, sugerir prioridades e criar ou concluir tarefas por você.`, new Date()));
}

let chatBusy = false;
async function sendChat(text) {
  text = text.trim();
  if (!text || chatBusy) return;
  chatBusy = true;
  const chat = $('#chat');
  $('#chatInput').value = '';
  chat.insertAdjacentHTML('beforeend', msgHtml('user', text, new Date()));
  chat.insertAdjacentHTML('beforeend', msgHtml('assistant', '', new Date()));
  const msgEl = chat.lastElementChild;
  const bubble = msgEl.querySelector('.bubble');
  bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  chat.scrollTop = chat.scrollHeight;
  let acc = '';
  let changed = false;
  try {
    await streamChat(text, (ev) => {
      if (ev.type === 'text') { acc += ev.text; bubble.innerHTML = chatMd(acc); }
      else if (ev.type === 'tool') {
        changed = true;
        const label = { create_task: 'Tarefa criada', update_task_status: 'Tarefa atualizada', list_tasks: 'Consultou tarefas' }[ev.name] || ev.name;
        msgEl.insertAdjacentHTML('beforeend', `<span class="tool-note">${icon('zap', 11)} ${label}</span>`);
      } else if (ev.type === 'notice') msgEl.insertAdjacentHTML('beforeend', `<span class="notice">${esc(ev.text)}</span>`);
      else if (ev.type === 'error') bubble.textContent = ev.text;
      chat.scrollTop = chat.scrollHeight;
    });
    if (changed || /criei|conclu|marcad/i.test(acc)) { await refreshProjects(); emit('tasks:changed'); }
  } catch (err) {
    bubble.textContent = `Erro: ${err.message}`;
  } finally {
    chatBusy = false;
  }
}

boot();
