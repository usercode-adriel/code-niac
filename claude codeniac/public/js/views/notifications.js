import { api } from '../api.js';
import { icon } from '../icons.js';
import { esc, timeAgo, toast, formData, notifIcon } from '../ui.js';
import { store, on, refreshUnread } from '../store.js';

export async function render(el) {
  let filter = 'all';
  const isAdmin = store.user.role === 'admin';
  el.innerHTML = `
    <div class="page-head"><div><h1>Atualizações</h1><p>Notificações de tarefas e novidades do sistema em tempo real.</p></div>
      <button class="btn outline" id="readAll">${icon('check', 14)} Marcar todas como lidas</button></div>
    <div class="two-col">
      <div class="stack">
        <div class="card">
          <h3 class="title">Versão ${esc(store.version)}</h3><p class="sub">Histórico de lançamentos do Codeniac</p>
          <div id="changelog" class="stack" style="gap:12px"></div>
        </div>
        ${isAdmin ? `<div class="card">
          <h3 class="title">Publicar atualização</h3><p class="sub">Envia uma notificação de sistema para todos os usuários.</p>
          <form class="form" id="broadcast">
            <div class="field"><label for="bTitle">Título</label><input id="bTitle" name="title" maxlength="120" required placeholder="Ex.: Nova função de metas"></div>
            <div class="field"><label for="bMsg">Mensagem</label><textarea id="bMsg" name="message" maxlength="1000" required></textarea></div>
            <div class="form-actions"><button class="btn primary">${icon('send', 13)} Publicar</button></div>
          </form></div>` : ''}
      </div>
      <div>
        <div class="tabs" role="tablist">
          <button data-f="all" class="on">Todas</button><button data-f="unread">Não lidas</button>
          <button data-f="update">Sistema</button><button data-f="task">Tarefas</button>
        </div>
        <div id="list"></div>
      </div>
    </div>`;

  const { entries } = await api.get('/changelog');
  el.querySelector('#changelog').innerHTML = entries.map((c) => `
    <div style="display:flex;gap:12px"><span class="chip" style="height:max-content;background:var(--accent-soft);color:var(--accent)">v${esc(c.version)}</span>
    <div><b style="font-weight:500;font-size:12px">${esc(c.title)}</b><p class="muted" style="margin:4px 0 0;font-size:11.5px;line-height:1.5">${esc(c.message)}</p></div></div>`).join('');

  const list = el.querySelector('#list');
  async function load() {
    const { items } = await api.get('/notifications');
    const shown = items.filter((n) => filter === 'all' || (filter === 'unread' ? !n.read : filter === 'update' ? n.type !== 'task' : n.type === filter));
    list.innerHTML = shown.length ? shown.map((n) => `
      <div class="notif ${n.type} ${n.read ? '' : 'unread'}" data-id="${n.id}">
        <div class="n-ico">${icon(notifIcon(n.type), 17)}</div>
        <div class="n-body"><h5>${esc(n.title)}</h5><p>${esc(n.message)}</p><time>${timeAgo(n.createdAt)}</time></div>
        <div class="n-acts">
          ${n.link ? `<a class="icon-btn sm ghost" href="${esc(n.link)}" aria-label="Abrir">${icon('eye', 14)}</a>` : ''}
          <button class="icon-btn sm ghost" data-read aria-label="${n.read ? 'Marcar como não lida' : 'Marcar como lida'}" title="${n.read ? 'Marcar como não lida' : 'Marcar como lida'}">${icon(n.read ? 'bell' : 'check', 14)}</button>
          <button class="icon-btn sm ghost" data-del aria-label="Excluir">${icon('trash', 14)}</button>
        </div>
      </div>`).join('')
      : `<div class="empty-state card"><div class="e-ico">${icon('bell', 22)}</div><b>Nada por aqui</b></div>`;
    list.querySelectorAll('.notif').forEach((row) => {
      const n = items.find((x) => x.id === row.dataset.id);
      row.querySelector('[data-read]').onclick = async () => { await api.put(`/notifications/${n.id}/read`, { read: !n.read }); await refreshUnread(); load(); };
      row.querySelector('[data-del]').onclick = async () => { await api.del(`/notifications/${n.id}`); await refreshUnread(); load(); };
    });
  }

  el.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.f;
    el.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === b));
    load();
  }));
  el.querySelector('#readAll').onclick = async () => { await api.put('/notifications/read-all'); await refreshUnread(); load(); };
  el.querySelector('#broadcast')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api.post('/notifications/broadcast', formData(e.target));
      toast('Atualização publicada', `Entregue para ${r.delivered} usuário(s).`, 'success');
      e.target.reset();
    } catch (err) { toast('Erro', err.message, 'error'); }
  });
  await load();
  return on('notification', load);
}
