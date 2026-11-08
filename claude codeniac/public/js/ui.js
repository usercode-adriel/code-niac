import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Markdown mínimo e seguro (escapa antes de formatar).
export function md(text) {
  let h = esc(text);
  h = h.replace(/!\[([^\]]*)\]\((\/uploads\/[\w.-]+|https?:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^# (.+)$/gm, '<h1>$1</h1>');
  h = h.replace(/(^|\n)((?:[-•] .+(?:\n|$))+)/g, (_, pre, list) =>
    `${pre}<ul>${list.trim().split('\n').map((l) => `<li>${l.replace(/^[-•] /, '')}</li>`).join('')}</ul>`);
  return h;
}

// Versão para o chat: mantém quebras de linha (white-space: pre-wrap).
export function chatMd(text) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
}

export function avatar(user, cls = '', size = 0) {
  const st = size ? ` style="--s:${size}px"` : '';
  if (!user) return `<div class="avatar ${cls}"${st}></div>`;
  return user.avatar
    ? `<div class="avatar ${cls}"${st}><img src="${esc(user.avatar)}" alt="Foto de ${esc(user.name)}"></div>`
    : `<div class="avatar ${cls}"${st} aria-label="${esc(user.name)}">${esc(initials(user.name))}</div>`;
}

export const notifIcon = (type) => (type === 'update' ? 'rocket' : type === 'task' ? 'check' : 'bell');

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
export function timeAgo(iso) {
  const diff = (new Date(iso) - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, s] of units) if (Math.abs(diff) >= s) return rtf.format(Math.round(diff / s), u);
  return 'agora';
}

export function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const isLate = (t) => t.status !== 'done' && t.dueDate && t.dueDate < todayISO();

export const PRIORITY = { high: 'Alta', medium: 'Média', low: 'Baixa' };
export const STATUS = { todo: 'A fazer', doing: 'Em andamento', done: 'Concluído' };
export const STATUS_COLOR = { todo: '#7d828c', doing: '#1f8fff', done: '#22c55e' };

// ---------- Toasts ----------
export function toast(title, message = '', type = 'info') {
  let box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.append(box); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const ico = type === 'error' ? 'x' : type === 'success' ? 'check' : 'bell';
  el.innerHTML = `${icon(ico, 16)}<div><b>${esc(title)}</b>${message ? `<span>${esc(message)}</span>` : ''}</div>`;
  box.append(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3800);
}

// ---------- Modal ----------
export function modal({ title, body, wide = false, onMount }) {
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn sm ghost" data-close aria-label="Fechar">${icon('x', 16)}</button></div>
    <div class="modal-body">${body}</div></div>`;
  const prevFocus = document.activeElement;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); prevFocus?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  back.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  const first = back.querySelector('input, textarea, select, button:not([data-close])');
  first?.focus();
  onMount?.(back.querySelector('.modal'), close);
  return close;
}

export function confirmDialog(title, message, okLabel = 'Excluir') {
  return new Promise((resolve) => {
    let answered = false;
    const close = modal({
      title,
      body: `<p class="muted" style="margin:0 0 18px;line-height:1.6">${esc(message)}</p>
        <div class="form-actions"><button class="btn outline" data-no>Cancelar</button><button class="btn danger" data-yes>${esc(okLabel)}</button></div>`,
      onMount: (m) => {
        m.querySelector('[data-yes]').onclick = () => { answered = true; close(); resolve(true); };
        m.querySelector('[data-no]').onclick = () => { answered = true; close(); resolve(false); };
        new MutationObserver((_, obs) => { if (!document.body.contains(m)) { obs.disconnect(); if (!answered) resolve(false); } })
          .observe(document.body, { childList: true });
      },
    });
  });
}

export function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// Área de upload com arrastar-e-soltar.
export function bindUploadZone(zone, input, onFile) {
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { if (input.files[0]) onFile(input.files[0]); input.value = ''; });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); zone.classList.remove('over');
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  });
}

export function validateImage(file) {
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) { toast('Formato inválido', 'Use PNG, JPG, WEBP ou GIF.', 'error'); return false; }
  if (file.size > 5 * 1024 * 1024) { toast('Imagem muito grande', 'O limite é 5 MB.', 'error'); return false; }
  return true;
}
