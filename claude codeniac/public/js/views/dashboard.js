import { api } from '../api.js';
import { icon } from '../icons.js';
import { esc, fmtDate, PRIORITY, timeAgo } from '../ui.js';
import { store, on } from '../store.js';
import { projectCard, openProjectModal, openTaskModal } from '../components.js';

// Título do destaque no estilo da referência: letras espaçadas + emblema no lugar do primeiro "O".
export function heroTitle(name, iconName) {
  const up = name.toUpperCase();
  const size = up.length > 9 ? `clamp(22px, ${Math.min(3.4, 34 / up.length).toFixed(2)}vw, 40px)` : '';
  const emblem = `<span class="hero-emblem">${icon(iconName, 24)}</span>`;
  const i = up.indexOf('O');
  const body = i >= 0 ? `${esc(up.slice(0, i))}${emblem}${esc(up.slice(i + 1))}` : `${emblem}${esc(up)}`;
  return `<h1 class="hero-title" style="${size ? `font-size:${size}` : ''}" aria-label="${esc(name)}">${body}</h1>`;
}

function heroArt(p) {
  return `<div class="hero-art"><div class="ring r2"></div><div class="ring"><span class="sat"></span></div><div class="orb">${icon(p.icon, 64)}</div></div>`;
}

export async function render(el) {
  const data = await api.get('/dashboard');
  const { totals } = data;
  const slides = [
    {
      name: 'Codeniac', icon: 'code', color: store.settings.accent || '#1f8fff', sub: 'Hub de projetos pessoais',
      desc: `Olá, ${store.user.name.split(' ')[0]}! Você tem ${totals.open} tarefa(s) aberta(s) em ${totals.projects} projetos.`,
      price: `${totals.progress}%`, cta: 'Nova tarefa', href: null,
    },
    ...data.projects.map((p) => ({
      name: p.name, icon: p.icon, color: p.color, cover: p.cover, sub: p.tagline || 'Projeto',
      desc: p.description, price: `${p.stats.done}/${p.stats.total}`, cta: 'Abrir', href: `#/project/${p.slug}`,
    })),
  ];

  // Três cartões, três tarefas diferentes: prioridade alta, próximo prazo e o seguinte.
  const focus = data.focus[0] || data.upcoming[0];
  const forYou = data.upcoming.find((t) => t.id !== focus?.id);
  const soon = data.upcoming.find((t) => t.id !== focus?.id && t.id !== forYou?.id);
  const upd = data.latestUpdate;

  const taskPoster = (t, cls = '') => t ? `
    <a class="poster ${cls}" href="#/project/${t.project.slug}" style="--c:${t.project.color}">
      <div class="art">${icon(t.project.icon, 90)}</div>
      <div class="body">
        <h4>${esc(t.title)}</h4>
        <div class="tag-row"><span>${esc(t.project.name)}</span><span>${PRIORITY[t.priority]}</span></div>
        <div class="foot">${t.dueDate ? `<span class="chip yellow">${fmtDate(t.dueDate)}</span>` : '<span></span>'}
          <span class="btn primary sm">Abrir <span class="circle">${icon('chevRight', 11)}</span></span></div>
      </div></a>` : `<div class="poster ${cls}" style="--c:#3a3e46"><div class="art">${icon('check', 70)}</div>
      <div class="body"><h4>Tudo em dia!</h4><div class="tag-row"><span>Sem pendências aqui</span></div></div></div>`;

  el.innerHTML = `
    <section class="hero" id="hero" aria-roledescription="carrossel" aria-label="Destaques"></section>

    <section class="stats" aria-label="Resumo">
      ${[['folder', totals.projects, 'Projetos'], ['tasks', totals.open, 'Tarefas abertas'], ['check', totals.done, 'Concluídas'], ['clock', totals.overdue, 'Atrasadas']]
        .map(([ic, v, l]) => `<div class="card stat"><div class="s-ico">${icon(ic, 18)}</div><div><b>${v}</b><span>${l}</span></div></div>`).join('')}
    </section>

    <div class="dash-grid">
      <div>
        <div class="section-head"><h3>Foco do dia</h3><a class="see-more" href="#/tasks">Ver mais ${icon('chevRight', 12)}</a></div>
        ${taskPoster(focus, 'tall')}
      </div>
      <div class="dash-right">
        <div>
          <div class="section-head"><h3>Últimas atualizações</h3><a class="see-more" href="#/notifications">Ver mais ${icon('chevRight', 12)}</a></div>
          <div class="card news-card">
            <div class="txt">
              <h4>${esc(upd?.title || 'Nenhuma atualização')}</h4>
              <p>${esc(upd?.message || 'As novidades do sistema aparecem aqui.')}</p>
              <a class="btn primary sm" href="#/notifications">Ler mais <span class="circle">${icon('chevRight', 11)}</span></a>
              ${upd ? `<small class="muted" style="margin-left:10px">${timeAgo(upd.createdAt)}</small>` : ''}
            </div>
            <div class="vis"><span class="version-art">v${esc(store.version)}</span></div>
          </div>
        </div>
        <div class="dash-pair">
          <div><div class="section-head"><h3>Para você</h3><a class="see-more" href="#/tasks">Ver mais ${icon('chevRight', 12)}</a></div>${taskPoster(forYou, 'mini-poster')}</div>
          <div><div class="section-head"><h3>Próximos prazos</h3><a class="see-more" href="#/tasks">Ver mais ${icon('chevRight', 12)}</a></div>${taskPoster(soon, 'mini-poster')}</div>
        </div>
      </div>
    </div>

    <div class="section-head"><h3>Seus projetos</h3><button class="see-more" id="addProject">${icon('plus', 12)} Novo projeto</button></div>
    <div class="projects-grid" id="projectsGrid"></div>`;

  // ----- Carrossel do destaque -----
  let idx = 0;
  const hero = el.querySelector('#hero');
  function paint() {
    const s = slides[idx];
    hero.style.setProperty('--c', s.color);
    hero.innerHTML = `
      ${s.cover ? `<div class="hero-cover" style="background-image:url('${esc(s.cover)}')"></div>` : heroArt(s)}
      <div class="hero-body">
        ${heroTitle(s.name, s.icon)}
        <p class="hero-sub">${esc(s.sub)}</p>
        ${s.desc ? `<p class="hero-desc">${esc(s.desc)}</p>` : ''}
        <div class="hero-actions"><span class="price">${esc(s.price)}</span>
          ${s.href ? `<a class="btn primary" href="${s.href}">${s.cta} <span class="circle">${icon('chevRight', 11)}</span></a>`
            : `<button class="btn primary" id="heroCta">${s.cta} <span class="circle">${icon('plus', 11)}</span></button>`}
        </div>
      </div>
      <div class="hero-nav">
        <button class="icon-btn sm" data-dir="-1" aria-label="Anterior">${icon('chevLeft', 14)}</button>
        <button class="icon-btn sm" data-dir="1" aria-label="Próximo">${icon('chevRight', 14)}</button>
      </div>
      <div class="hero-dots">${slides.map((_, i) => `<button class="${i === idx ? 'on' : ''}" data-i="${i}" aria-label="Destaque ${i + 1}"></button>`).join('')}</div>`;
    hero.querySelector('#heroCta')?.addEventListener('click', () => openTaskModal(null, { projectId: store.projects[0]?.id }));
  }
  hero.addEventListener('click', (e) => {
    const dot = e.target.closest('[data-i]');
    const nav = e.target.closest('[data-dir]');
    if (dot) { idx = Number(dot.dataset.i); paint(); restart(); }
    if (nav) { idx = (idx + Number(nav.dataset.dir) + slides.length) % slides.length; paint(); restart(); }
  });
  let timer;
  const restart = () => {
    clearInterval(timer);
    if (store.settings.heroAutoplay !== false && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      timer = setInterval(() => { if (!hero.matches(':hover')) { idx = (idx + 1) % slides.length; paint(); } }, 7000);
    }
  };
  paint(); restart();

  // ----- Cards de projetos -----
  const grid = el.querySelector('#projectsGrid');
  const paintProjects = () => {
    grid.innerHTML = store.projects.map(projectCard).join('') +
      `<button class="new-project" id="newProjCard">${icon('plus', 26)}<span>Novo projeto</span></button>`;
    grid.querySelector('#newProjCard').onclick = newProject;
  };
  async function newProject() {
    const p = await openProjectModal();
    if (p) location.hash = `#/project/${p.slug}`;
  }
  el.querySelector('#addProject').onclick = newProject;
  paintProjects();
  const off = on('projects', paintProjects);

  return () => { clearInterval(timer); off(); };
}
