import { api } from '../api.js';
import { icon } from '../icons.js';
import { esc, STATUS, PRIORITY, STATUS_COLOR } from '../ui.js';
import { store, on, projectById } from '../store.js';
import { openTaskModal, deleteTask, toggleTask, priorityChip, dueChip } from '../components.js';

export async function render(el) {
  const f = { projectId: '', status: '', priority: '', q: '' };
  el.innerHTML = `
    <div class="page-head"><div><h1>Minhas tarefas</h1><p>Todas as tarefas de todos os projetos em um só lugar.</p></div>
      <button class="btn primary" id="newTask">${icon('plus', 14)} Nova tarefa</button></div>
    <div class="toolbar card" style="padding:12px">
      <div class="search" style="max-width:none;flex:1;min-width:180px;height:36px;background:var(--bg-input)"><span class="muted">${icon('search', 14)}</span><input id="q" placeholder="Buscar tarefa..." aria-label="Buscar tarefa"></div>
      <select class="input" id="fProject" style="width:auto" aria-label="Projeto"><option value="">Todos os projetos</option>
        ${store.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
      <select class="input" id="fStatus" style="width:auto" aria-label="Status"><option value="">Todos os status</option>
        ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <select class="input" id="fPriority" style="width:auto" aria-label="Prioridade"><option value="">Todas as prioridades</option>
        ${Object.entries(PRIORITY).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    </div>
    <div class="card" style="padding:6px 8px"><div class="table-wrap" id="list"></div></div>`;

  const list = el.querySelector('#list');
  async function load() {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
    const tasks = await api.get(`/tasks${qs ? `?${qs}` : ''}`);
    if (!tasks.length) {
      list.innerHTML = `<div class="empty-state"><div class="e-ico">${icon('tasks', 22)}</div><b>Nenhuma tarefa encontrada</b></div>`;
      return;
    }
    list.innerHTML = `<table class="table"><thead><tr><th style="width:36px"></th><th>Tarefa</th><th>Projeto</th><th>Status</th><th>Prioridade</th><th>Prazo</th><th></th></tr></thead><tbody>
      ${tasks.map((t) => {
        const p = projectById(t.projectId) || {};
        return `<tr data-id="${t.id}">
          <td><button class="check ${t.status === 'done' ? 'on' : ''}" data-check aria-label="${t.status === 'done' ? 'Reabrir' : 'Concluir'} ${esc(t.title)}">${t.status === 'done' ? icon('check', 12) : ''}</button></td>
          <td style="${t.status === 'done' ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(t.title)}</td>
          <td><a class="proj" href="#/project/${p.slug}"><span class="mini-ico" style="--c:${p.color}">${icon(p.icon, 11)}</span>${esc(p.name || '')}</a></td>
          <td><span class="chip"><span class="status-dot" style="background:${STATUS_COLOR[t.status]}"></span>${STATUS[t.status]}</span></td>
          <td>${priorityChip(t.priority)}</td>
          <td>${dueChip(t) || '<span class="muted">—</span>'}</td>
          <td style="white-space:nowrap;text-align:right"><button class="icon-btn sm ghost" data-edit aria-label="Editar">${icon('edit', 13)}</button><button class="icon-btn sm ghost" data-del aria-label="Excluir">${icon('trash', 13)}</button></td>
        </tr>`;
      }).join('')}</tbody></table>`;
    list.querySelectorAll('tr[data-id]').forEach((row) => {
      const t = tasks.find((x) => x.id === row.dataset.id);
      row.querySelector('[data-check]').onclick = () => toggleTask(t);
      row.querySelector('[data-edit]').onclick = () => openTaskModal(t);
      row.querySelector('[data-del]').onclick = () => deleteTask(t);
    });
  }

  let timer;
  el.querySelector('#q').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { f.q = e.target.value.trim(); load(); }, 200); });
  el.querySelector('#fProject').onchange = (e) => { f.projectId = e.target.value; load(); };
  el.querySelector('#fStatus').onchange = (e) => { f.status = e.target.value; load(); };
  el.querySelector('#fPriority').onchange = (e) => { f.priority = e.target.value; load(); };
  el.querySelector('#newTask').onclick = () => openTaskModal(null, { projectId: f.projectId || store.projects[0]?.id });
  await load();
  return on('tasks:changed', load);
}
