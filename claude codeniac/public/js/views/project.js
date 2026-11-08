import { api } from '../api.js';
import { icon } from '../icons.js';
import { esc, md, modal, toast, formData, confirmDialog, timeAgo, STATUS, STATUS_COLOR, validateImage, bindUploadZone } from '../ui.js';
import { store, on, refreshProjects } from '../store.js';
import { openTaskModal, openProjectModal, deleteTask, toggleTask, priorityChip, dueChip } from '../components.js';
import { heroTitle } from './dashboard.js';

export async function render(el, [slug, tab = 'board']) {
  let p = await api.get(`/projects/${encodeURIComponent(slug)}`);
  let activeTab = ['board', 'notes', 'links'].includes(tab) ? tab : 'board';
  let filter = '';

  el.innerHTML = `
    <section class="hero project-hero" id="pHero"></section>
    <div class="toolbar">
      <div class="tabs" role="tablist">
        <button data-tab="board" role="tab">${icon('columns', 14)} Quadro</button>
        <button data-tab="notes" role="tab">${icon('note', 14)} Notas</button>
        <button data-tab="links" role="tab">${icon('link', 14)} Links</button>
      </div>
      <div class="grow"></div>
      <div class="search" style="max-width:240px;height:34px" id="filterBox"><span class="muted">${icon('search', 14)}</span><input id="filter" placeholder="Filtrar..." aria-label="Filtrar"></div>
      <button class="btn primary" id="addBtn"></button>
    </div>
    <div id="tabBody"></div>`;

  const hero = el.querySelector('#pHero');
  const body = el.querySelector('#tabBody');
  const coverInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });
  el.append(coverInput);

  function paintHero() {
    hero.style.setProperty('--c', p.color);
    hero.innerHTML = `
      ${p.cover ? `<div class="hero-cover" style="background-image:url('${esc(p.cover)}')"></div>`
        : `<div class="hero-art"><div class="ring r2"></div><div class="ring"><span class="sat"></span></div><div class="orb">${icon(p.icon, 64)}</div></div>`}
      <div class="hero-body">
        ${heroTitle(p.name, p.icon)}
        <p class="hero-sub">${esc(p.tagline || 'Projeto')}</p>
        ${p.description ? `<p class="hero-desc">${esc(p.description)}</p>` : ''}
        <div class="kpis">
          <div><b>${p.stats.progress}%</b><span>Concluído</span></div>
          <div><b>${p.stats.todo}</b><span>A fazer</span></div>
          <div><b>${p.stats.doing}</b><span>Em andamento</span></div>
          <div><b>${p.stats.done}</b><span>Concluídas</span></div>
        </div>
      </div>
      <div class="hero-nav">
        <button class="icon-btn sm" id="favBtn" aria-label="${p.favorite ? 'Remover dos favoritos' : 'Favoritar'}" title="Favorito" style="${p.favorite ? 'color:#ef4444' : ''}">${icon('heart', 14, p.favorite ? 'fill="currentColor"' : '')}</button>
        <button class="icon-btn sm" id="coverBtn" aria-label="Alterar capa" title="Enviar imagem de capa">${icon('image', 14)}</button>
        ${p.cover ? `<button class="icon-btn sm" id="coverDel" aria-label="Remover capa" title="Remover capa">${icon('x', 14)}</button>` : ''}
        <button class="icon-btn sm" id="editBtn" aria-label="Editar projeto" title="Editar">${icon('edit', 14)}</button>
        <button class="icon-btn sm" id="delBtn" aria-label="Excluir projeto" title="Excluir">${icon('trash', 14)}</button>
      </div>`;
    hero.querySelector('#favBtn').onclick = async () => { await api.put(`/projects/${p.id}`, { favorite: !p.favorite }); await reload(); };
    hero.querySelector('#coverBtn').onclick = () => coverInput.click();
    hero.querySelector('#coverDel')?.addEventListener('click', async () => { await api.del(`/projects/${p.id}/cover`); await reload(); });
    hero.querySelector('#editBtn').onclick = async () => {
      const saved = await openProjectModal(p);
      if (saved && saved.slug !== slug) location.hash = `#/project/${saved.slug}`; else if (saved) await reload();
    };
    hero.querySelector('#delBtn').onclick = async () => {
      if (!(await confirmDialog('Excluir projeto?', `"${p.name}" e todas as suas tarefas, notas e links serão removidos.`))) return;
      await api.del(`/projects/${p.id}`);
      await refreshProjects();
      toast('Projeto excluído', p.name, 'success');
      location.hash = '#/dashboard';
    };
  }
  coverInput.addEventListener('change', async () => {
    const f = coverInput.files[0]; coverInput.value = '';
    if (!f || !validateImage(f)) return;
    try { await api.upload(`/projects/${p.id}/cover`, f); toast('Capa atualizada', '', 'success'); await reload(); }
    catch (err) { toast('Erro no upload', err.message, 'error'); }
  });

  async function reload() {
    p = await api.get(`/projects/${p.id}`);
    await refreshProjects();
    paintHero(); paintTab();
  }

  // ----- Abas -----
  function paintTab() {
    el.querySelectorAll('[data-tab]').forEach((b) => { b.classList.toggle('on', b.dataset.tab === activeTab); b.setAttribute('aria-selected', b.dataset.tab === activeTab); });
    const labels = { board: 'Nova tarefa', notes: 'Nova nota', links: 'Novo link' };
    el.querySelector('#addBtn').innerHTML = `${icon('plus', 14)} ${labels[activeTab]}`;
    if (activeTab === 'board') paintBoard();
    if (activeTab === 'notes') paintNotes();
    if (activeTab === 'links') paintLinks();
  }
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    activeTab = b.dataset.tab;
    history.replaceState(null, '', `#/project/${p.slug}${activeTab === 'board' ? '' : `/${activeTab}`}`);
    paintTab();
  }));
  el.querySelector('#filter').addEventListener('input', (e) => { filter = e.target.value.toLowerCase(); paintTab(); });
  el.querySelector('#addBtn').onclick = async () => {
    if (activeTab === 'board') { if (await openTaskModal(null, { projectId: p.id })) reload(); }
    if (activeTab === 'notes') editNote();
    if (activeTab === 'links') addLink();
  };

  // ----- Quadro kanban -----
  function paintBoard() {
    const tasks = p.tasks.filter((t) => !filter || `${t.title} ${t.description}`.toLowerCase().includes(filter));
    body.innerHTML = `<div class="board">${Object.entries(STATUS).map(([st, label]) => {
      const list = tasks.filter((t) => t.status === st);
      return `<div class="column" data-status="${st}" aria-label="${label}">
        <div class="column-head"><span class="status-dot" style="background:${STATUS_COLOR[st]}"></span>${label}<span class="count">${list.length}</span>
          <button class="icon-btn sm ghost add" data-add="${st}" aria-label="Adicionar em ${label}">${icon('plus', 14)}</button></div>
        ${list.map(taskHtml).join('') || '<div class="empty-col">Arraste tarefas para cá</div>'}
      </div>`;
    }).join('')}</div>`;

    body.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', async () => {
      if (await openTaskModal(null, { projectId: p.id, status: b.dataset.add })) reload();
    }));
    body.querySelectorAll('.task').forEach((card) => {
      const t = p.tasks.find((x) => x.id === card.dataset.id);
      card.addEventListener('dragstart', (e) => { card.classList.add('dragging'); e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.querySelector('[data-check]').addEventListener('click', async () => { await toggleTask(t); reload(); });
      card.querySelector('[data-edit]').addEventListener('click', async () => { await openTaskModal(t); reload(); });
      card.querySelector('[data-del]').addEventListener('click', async () => { if (await deleteTask(t)) reload(); });
      card.addEventListener('dblclick', async () => { await openTaskModal(t); reload(); });
      // Acessibilidade: mover com teclado (setas esquerda/direita)
      card.addEventListener('keydown', async (e) => {
        if (e.target !== card) return;
        const order = ['todo', 'doing', 'done'];
        const i = order.indexOf(t.status);
        const next = e.key === 'ArrowRight' ? order[i + 1] : e.key === 'ArrowLeft' ? order[i - 1] : null;
        if (next) { await api.put(`/tasks/${t.id}`, { status: next }); await reload(); body.querySelector(`[data-id="${t.id}"]`)?.focus(); }
        if (e.key === 'Enter') { await openTaskModal(t); reload(); }
      });
    });
    body.querySelectorAll('.column').forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drag-over'); });
      col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over'); });
      col.addEventListener('drop', async (e) => {
        e.preventDefault(); col.classList.remove('drag-over');
        const taskId = e.dataTransfer.getData('text/plain');
        const t = p.tasks.find((x) => x.id === taskId);
        if (!t || t.status === col.dataset.status) return;
        t.status = col.dataset.status; paintBoard(); // atualização otimista
        try { await api.put(`/tasks/${taskId}`, { status: col.dataset.status }); } catch (err) { toast('Erro', err.message, 'error'); }
        reload();
      });
    });
  }

  function taskHtml(t) {
    return `<article class="task ${t.status === 'done' ? 'done' : ''}" draggable="true" tabindex="0" data-id="${t.id}"
      aria-label="${esc(t.title)}. Use setas para mover entre colunas.">
      <h5><button class="check ${t.status === 'done' ? 'on' : ''}" data-check aria-label="${t.status === 'done' ? 'Reabrir' : 'Concluir'}">${t.status === 'done' ? icon('check', 12) : ''}</button><span>${esc(t.title)}</span></h5>
      ${t.description ? `<p>${esc(t.description)}</p>` : ''}
      <div class="foot">${priorityChip(t.priority)}${dueChip(t)}
        <span class="acts"><button class="icon-btn sm ghost" data-edit aria-label="Editar">${icon('edit', 13)}</button>
        <button class="icon-btn sm ghost" data-del aria-label="Excluir">${icon('trash', 13)}</button></span></div>
    </article>`;
  }

  // ----- Notas (com imagens enviadas por upload) -----
  function paintNotes() {
    const notes = p.notes.filter((n) => !filter || `${n.title} ${n.content}`.toLowerCase().includes(filter))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned));
    body.innerHTML = notes.length ? `<div class="notes-grid">${notes.map((n) => `
      <article class="card note" tabindex="0" data-id="${n.id}">
        <h5>${n.pinned ? icon('pin', 13) : ''}${esc(n.title)}</h5>
        <div class="md">${md(n.content)}</div>
        <time>Editada ${timeAgo(n.updatedAt)}</time>
      </article>`).join('')}</div>`
      : `<div class="empty-state card"><div class="e-ico">${icon('note', 22)}</div><b>Nenhuma nota ainda</b><p>Guarde ideias, resumos e referências deste projeto.</p></div>`;
    body.querySelectorAll('.note').forEach((card) => {
      const open = () => editNote(p.notes.find((n) => n.id === card.dataset.id));
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });
  }

  function editNote(note = null) {
    modal({
      title: note ? 'Editar nota' : 'Nova nota', wide: true,
      body: `<form class="form">
        <div class="field"><label for="nTitle">Título</label><input id="nTitle" name="title" maxlength="120" value="${esc(note?.title || '')}"></div>
        <div class="field"><label for="nContent">Conteúdo <span class="hint">— suporta **negrito**, listas com "-", [links](https://...) e imagens</span></label>
          <textarea id="nContent" name="content" style="min-height:220px">${esc(note?.content || '')}</textarea></div>
        <div class="upload-zone" tabindex="0" role="button" id="noteUpload">${icon('upload', 16)} Arraste uma imagem ou clique para inserir na nota</div>
        <input type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" id="noteFile">
        <label style="display:flex;gap:10px;align-items:center;font-size:12px"><span class="switch"><input type="checkbox" name="pinned" ${note?.pinned ? 'checked' : ''}><span></span></span> Fixar no topo</label>
        <div class="form-actions">
          ${note ? `<button type="button" class="btn danger" data-del style="margin-right:auto">${icon('trash', 14)} Excluir</button>` : ''}
          <button type="button" class="btn outline" data-close>Cancelar</button><button class="btn primary">Salvar</button></div>
      </form>`,
      onMount: (m, close) => {
        const ta = m.querySelector('#nContent');
        bindUploadZone(m.querySelector('#noteUpload'), m.querySelector('#noteFile'), async (file) => {
          if (!validateImage(file)) return;
          try {
            const { url } = await api.upload('/uploads', file);
            ta.setRangeText(`\n![imagem](${url})\n`, ta.selectionStart, ta.selectionEnd, 'end');
            toast('Imagem inserida', '', 'success');
          } catch (err) { toast('Erro no upload', err.message, 'error'); }
        });
        m.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const d = formData(e.target);
          const payload = { title: d.title, content: d.content, pinned: d.pinned === 'on', projectId: p.id };
          try {
            if (note) await api.put(`/notes/${note.id}`, payload); else await api.post('/notes', payload);
            close(); toast('Nota salva', '', 'success'); reload();
          } catch (err) { toast('Erro', err.message, 'error'); }
        });
        m.querySelector('[data-del]')?.addEventListener('click', async () => {
          close();
          if (await confirmDialog('Excluir nota?', `"${note.title}" será removida.`)) { await api.del(`/notes/${note.id}`); reload(); }
        });
      },
    });
  }

  // ----- Links -----
  function paintLinks() {
    const links = p.links.filter((l) => !filter || `${l.title} ${l.url}`.toLowerCase().includes(filter));
    body.innerHTML = links.length ? `<div class="links-list">${links.map((l) => {
      let host = ''; try { host = new URL(l.url).hostname; } catch { /* url inválida */ }
      return `<div class="card link-row"><div class="fav-ico">${icon('link', 15)}</div>
        <div class="t"><b>${esc(l.title)}</b><small>${esc(l.url)}</small></div>
        <a class="btn outline sm" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">Abrir</a>
        <button class="icon-btn sm ghost" data-del="${l.id}" aria-label="Excluir link ${esc(host)}">${icon('trash', 13)}</button></div>`;
    }).join('')}</div>`
      : `<div class="empty-state card"><div class="e-ico">${icon('link', 22)}</div><b>Nenhum link salvo</b><p>Documentações, cursos, planilhas, repositórios...</p></div>`;
    body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      await api.del(`/links/${b.dataset.del}`); reload();
    }));
  }

  function addLink() {
    modal({
      title: 'Novo link',
      body: `<form class="form">
        <div class="field"><label for="lUrl">URL</label><input id="lUrl" name="url" type="url" required placeholder="https://"></div>
        <div class="field"><label for="lTitle">Título</label><input id="lTitle" name="title" maxlength="120" placeholder="Opcional"></div>
        <div class="form-actions"><button type="button" class="btn outline" data-close>Cancelar</button><button class="btn primary">Adicionar</button></div></form>`,
      onMount: (m, close) => m.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try { await api.post('/links', { ...formData(e.target), projectId: p.id }); close(); reload(); }
        catch (err) { toast('Erro', err.message, 'error'); }
      }),
    });
  }

  paintHero();
  paintTab();
  const off = on('tasks:changed', async () => {
    p = await api.get(`/projects/${p.id}`).catch(() => p);
    paintHero(); if (activeTab === 'board') paintBoard();
  });
  return off;
}
