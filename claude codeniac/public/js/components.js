// Componentes compartilhados entre as views.
import { api } from './api.js';
import { icon, PROJECT_ICONS } from './icons.js';
import { esc, modal, toast, formData, PRIORITY, STATUS, fmtDate, isLate, confirmDialog } from './ui.js';
import { store, refreshProjects, emit } from './store.js';

export const PROJECT_COLORS = ['#1f8fff', '#8b5cf6', '#f7931a', '#22c55e', '#ef4444', '#06b6d4', '#eab308', '#ec4899', '#14b8a6', '#f97316'];

// Modal de criação/edição de tarefa.
export function openTaskModal(task = null, defaults = {}) {
  const t = task || { status: 'todo', priority: 'medium', ...defaults };
  const projectOpts = store.projects.map((p) =>
    `<option value="${p.id}" ${p.id === t.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  return new Promise((resolve) => {
    modal({
      title: task ? 'Editar tarefa' : 'Nova tarefa',
      body: `<form class="form" novalidate>
        <div class="field"><label for="tTitle">Título</label><input id="tTitle" name="title" required maxlength="160" value="${esc(t.title || '')}" placeholder="Ex.: Revisar pull request"></div>
        <div class="field"><label for="tDesc">Descrição</label><textarea id="tDesc" name="description" maxlength="2000" placeholder="Detalhes, links, checklist...">${esc(t.description || '')}</textarea></div>
        <div class="form-row">
          <div class="field"><label for="tProj">Projeto</label><select id="tProj" name="projectId">${projectOpts}</select></div>
          <div class="field"><label for="tDue">Prazo</label><input id="tDue" type="date" name="dueDate" value="${esc(t.dueDate || '')}"></div>
        </div>
        <div class="form-row">
          <div class="field"><label for="tPrio">Prioridade</label><select id="tPrio" name="priority">
            ${Object.entries(PRIORITY).map(([k, v]) => `<option value="${k}" ${k === t.priority ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field"><label for="tStatus">Status</label><select id="tStatus" name="status">
            ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === t.status ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        </div>
        <div class="form-actions">
          ${task ? `<button type="button" class="btn danger" data-del style="margin-right:auto">${icon('trash', 14)} Excluir</button>` : ''}
          <button type="button" class="btn outline" data-close>Cancelar</button>
          <button class="btn primary" type="submit">${task ? 'Salvar' : 'Criar tarefa'}</button>
        </div></form>`,
      onMount: (m, close) => {
        const form = m.querySelector('form');
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const data = formData(form);
          if (!data.title.trim()) { toast('Informe um título', '', 'error'); return; }
          try {
            const saved = task ? await api.put(`/tasks/${task.id}`, data) : await api.post('/tasks', data);
            toast(task ? 'Tarefa atualizada' : 'Tarefa criada', saved.title, 'success');
            close(); await refreshProjects(); emit('tasks:changed'); resolve(saved);
          } catch (err) { toast('Erro', err.message, 'error'); }
        });
        m.querySelector('[data-del]')?.addEventListener('click', async () => {
          close();
          if (await deleteTask(task)) resolve(null);
        });
      },
    });
  });
}

export async function deleteTask(task) {
  if (!(await confirmDialog('Excluir tarefa?', `"${task.title}" será removida permanentemente.`))) return false;
  await api.del(`/tasks/${task.id}`);
  toast('Tarefa excluída', '', 'success');
  await refreshProjects(); emit('tasks:changed');
  return true;
}

export async function toggleTask(task) {
  const status = task.status === 'done' ? 'todo' : 'done';
  await api.put(`/tasks/${task.id}`, { status });
  await refreshProjects(); emit('tasks:changed');
}

// Modal de criação/edição de projeto.
export function openProjectModal(project = null) {
  const p = project || { icon: 'folder', color: PROJECT_COLORS[store.projects.length % PROJECT_COLORS.length] };
  return new Promise((resolve) => {
    modal({
      title: project ? 'Editar projeto' : 'Novo projeto',
      body: `<form class="form">
        <div class="form-row">
          <div class="field"><label for="pName">Nome</label><input id="pName" name="name" required maxlength="60" value="${esc(p.name || '')}" placeholder="Ex.: Fotografia"></div>
          <div class="field"><label for="pTag">Subtítulo</label><input id="pTag" name="tagline" maxlength="60" value="${esc(p.tagline || '')}" placeholder="Ex.: Ensaios · Edição"></div>
        </div>
        <div class="field"><label for="pDesc">Descrição</label><textarea id="pDesc" name="description" maxlength="300" style="min-height:70px">${esc(p.description || '')}</textarea></div>
        <div class="field"><label>Ícone</label><div class="icon-pick">${PROJECT_ICONS.map((i) =>
          `<button type="button" data-icon="${i}" class="${i === p.icon ? 'on' : ''}" aria-label="${i}">${icon(i, 16)}</button>`).join('')}</div></div>
        <div class="field"><label>Cor</label><div class="swatches">${PROJECT_COLORS.map((c) =>
          `<button type="button" class="swatch ${c === p.color ? 'on' : ''}" style="--c:${c}" data-color="${c}" aria-label="Cor ${c}"></button>`).join('')}</div></div>
        <div class="form-actions"><button type="button" class="btn outline" data-close>Cancelar</button>
        <button class="btn primary" type="submit">${project ? 'Salvar' : 'Criar projeto'}</button></div></form>`,
      onMount: (m, close) => {
        let chosenIcon = p.icon; let chosenColor = p.color;
        m.querySelectorAll('[data-icon]').forEach((b) => b.addEventListener('click', () => {
          chosenIcon = b.dataset.icon; m.querySelectorAll('[data-icon]').forEach((x) => x.classList.toggle('on', x === b));
        }));
        m.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => {
          chosenColor = b.dataset.color; m.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b));
        }));
        m.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const data = { ...formData(e.target), icon: chosenIcon, color: chosenColor };
          if (!data.name.trim()) { toast('Informe um nome', '', 'error'); return; }
          try {
            const saved = project ? await api.put(`/projects/${project.id}`, data) : await api.post('/projects', data);
            toast(project ? 'Projeto atualizado' : 'Projeto criado', saved.name, 'success');
            close(); await refreshProjects(); resolve(saved);
          } catch (err) { toast('Erro', err.message, 'error'); }
        });
      },
    });
  });
}

export function priorityChip(p) { return `<span class="chip ${p}">${icon('flag', 10)} ${PRIORITY[p]}</span>`; }
export function dueChip(t) {
  if (!t.dueDate) return '';
  return `<span class="chip ${isLate(t) ? 'late' : ''}">${icon('calendar', 10)} ${fmtDate(t.dueDate)}</span>`;
}

// Cartão de projeto (usado no dashboard).
export function projectCard(p) {
  return `<a class="project-card" href="#/project/${p.slug}" style="--c:${p.color}" aria-label="Abrir projeto ${esc(p.name)}">
    ${p.cover ? `<div class="bg" style="background-image:url('${esc(p.cover)}')"></div>` : `<div class="glyph">${icon(p.icon, 150)}</div>`}
    <div class="ico">${icon(p.icon, 20)}</div>
    ${p.favorite ? `<div class="fav">${icon('heart', 16, 'fill="currentColor"')}</div>` : ''}
    <div class="body">
      <h4>${esc(p.name)}</h4>
      <div class="tagline">${esc(p.tagline || p.description || '')}</div>
      <div class="meta"><span>${p.stats.done}/${p.stats.total} tarefas</span><span>${p.stats.progress}%</span></div>
      <div class="progress" role="progressbar" aria-valuenow="${p.stats.progress}" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso de ${esc(p.name)}"><span style="width:${p.stats.progress}%"></span></div>
    </div></a>`;
}
