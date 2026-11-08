import { api } from '../api.js';
import { icon } from '../icons.js';
import { esc } from '../ui.js';
import { store } from '../store.js';

// Gamificação: nível por tarefas concluídas + conquistas desbloqueáveis.
export async function render(el) {
  const tasks = await api.get('/tasks');
  const done = tasks.filter((t) => t.status === 'done');
  const xp = done.reduce((a, t) => a + ({ high: 30, medium: 20, low: 10 }[t.priority] || 10), 0);
  const level = Math.floor(xp / 100) + 1;
  const inLevel = xp % 100;
  const doneIn = (slug) => {
    const p = store.projects.find((x) => x.slug === slug);
    return p ? done.filter((t) => t.projectId === p.id).length : 0;
  };
  const complete = store.projects.filter((p) => p.stats.total > 0 && p.stats.progress === 100);
  const onTime = done.filter((t) => t.dueDate && t.completedAt && t.completedAt.slice(0, 10) <= t.dueDate).length;

  const badges = [
    ['check', 'Primeiro passo', 'Conclua 1 tarefa', done.length >= 1],
    ['zap', 'Produtivo', 'Conclua 10 tarefas', done.length >= 10],
    ['rocket', 'Imparável', 'Conclua 50 tarefas', done.length >= 50],
    ['trophy', 'Projeto zerado', 'Leve um projeto a 100%', complete.length >= 1],
    ['clock', 'Pontual', '5 tarefas dentro do prazo', onTime >= 5],
    ['code', 'Dev em ação', '5 tarefas em Programação', doneIn('programacao') >= 5],
    ['globe', 'Fluent mindset', '5 tarefas em English', doneIn('english') >= 5],
    ['book', 'Leitor voraz', '5 tarefas em Livros', doneIn('livros') >= 5],
    ['trending', 'Investidor disciplinado', '5 tarefas em Investimentos', doneIn('investimentos') >= 5],
    ['layers', 'Colecionador', 'Crie 8 ou mais projetos', store.projects.length >= 8],
  ];
  const unlocked = badges.filter((b) => b[3]).length;

  el.innerHTML = `
    <div class="page-head"><div><h1>Conquistas</h1><p>Cada tarefa concluída rende XP: alta = 30, média = 20, baixa = 10.</p></div></div>
    <div class="card level-card">
      <div class="level-badge" aria-label="Nível ${level}">${level}</div>
      <div style="flex:1">
        <h3 class="title" style="font-size:16px">Nível ${level}</h3>
        <p class="sub" style="margin-bottom:10px">${xp} XP no total · ${100 - inLevel} XP para o nível ${level + 1}</p>
        <div class="progress" style="height:8px" role="progressbar" aria-valuenow="${inLevel}" aria-valuemin="0" aria-valuemax="100" aria-label="XP no nível atual"><span style="width:${inLevel}%"></span></div>
      </div>
      <div style="text-align:center"><b style="font-size:22px">${unlocked}/${badges.length}</b><div class="muted" style="font-size:11px">conquistas</div></div>
    </div>
    <div class="two-col" style="grid-template-columns:minmax(0,1fr) minmax(0,1.3fr)">
      <div class="card">
        <h3 class="title">Progresso por projeto</h3><p class="sub">Percentual de tarefas concluídas</p>
        <div class="bars">${store.projects.map((p) => `
          <div class="bar-row"><span style="display:flex;gap:8px;align-items:center;min-width:0"><span class="mini-ico" style="--c:${p.color}">${icon(p.icon, 11)}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</span></span>
          <div class="progress" style="--c:${p.color}" role="progressbar" aria-valuenow="${p.stats.progress}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(p.name)}"><span style="width:${p.stats.progress}%"></span></div>
          <span class="v">${p.stats.progress}%</span></div>`).join('')}
        </div>
      </div>
      <div class="badges">${badges.map(([ic, title, desc, ok]) => `
        <div class="card badge ${ok ? 'on' : ''}"><div class="b-ico">${icon(ok ? ic : 'shield', 22)}</div><b>${title}</b><small>${desc}</small>
        <div style="margin-top:8px"><span class="chip ${ok ? 'low' : ''}">${ok ? `${icon('check', 10)} Desbloqueada` : 'Bloqueada'}</span></div></div>`).join('')}
      </div>
    </div>`;
}
