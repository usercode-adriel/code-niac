import { api, auth } from '../api.js';
import { icon } from '../icons.js';
import { esc, toast } from '../ui.js';
import { store, applySettings } from '../store.js';
import { PROJECT_COLORS } from '../components.js';

export async function render(el) {
  const s = await api.get('/settings');
  const toggle = (key, title, desc) => `
    <div class="setting-row"><div class="txt"><b>${title}</b><small>${desc}</small></div>
      <label class="switch"><input type="checkbox" data-key="${key}" ${s[key] ? 'checked' : ''} aria-label="${title}"><span></span></label></div>`;

  el.innerHTML = `
    <div class="page-head"><div><h1>Configurações</h1><p>Personalize a aparência, notificações e o assistente.</p></div></div>
    <div class="two-col" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
      <div class="stack">
        <div class="card">
          <h3 class="title">${icon('palette', 15)} Aparência</h3><p class="sub">Cor de destaque e densidade da interface.</p>
          <div class="setting-row"><div class="txt"><b>Cor de destaque</b><small>Botões, links e indicadores ativos</small></div></div>
          <div class="swatches" id="accents">${PROJECT_COLORS.map((c) => `<button class="swatch ${c === s.accent ? 'on' : ''}" style="--c:${c}" data-accent="${c}" aria-label="Cor ${c}"></button>`).join('')}
            <label class="swatch" style="--c:conic-gradient(red,yellow,lime,cyan,blue,magenta,red);cursor:pointer;position:relative" aria-label="Cor personalizada">
              <input type="color" id="customAccent" value="${s.accent}" style="opacity:0;position:absolute;inset:0;cursor:pointer"></label></div>
          <div class="setting-row" style="margin-top:8px"><div class="txt"><b>Modo compacto</b><small>Reduz espaçamentos para caber mais conteúdo</small></div>
            <label class="switch"><input type="checkbox" id="density" ${s.density === 'compact' ? 'checked' : ''} aria-label="Modo compacto"><span></span></label></div>
          ${toggle('heroAutoplay', 'Destaque automático', 'Alterna os projetos do banner do dashboard a cada 7s')}
        </div>
        <div class="card">
          <h3 class="title">${icon('bell', 15)} Notificações</h3><p class="sub">Escolha o que deve chegar até você.</p>
          ${toggle('notifyTasks', 'Atividade de tarefas', 'Tarefas concluídas e projetos criados')}
          ${toggle('notifySystem', 'Atualizações do sistema', 'Novas versões e comunicados')}
          ${toggle('notifySound', 'Som de notificação', 'Toca um aviso curto ao receber notificações')}
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <h3 class="title">${icon('bot', 15)} Assistente IA</h3>
          <p class="sub">Status: <b style="color:${store.aiMode === 'claude' ? 'var(--ok)' : 'var(--warn)'}">${store.aiMode === 'claude' ? 'Claude conectado' : 'Modo local (offline)'}</b></p>
          ${toggle('assistantEnabled', 'Assistente ativo', 'Responde no painel lateral e pode criar/concluir tarefas')}
          ${toggle('showAssistantPanel', 'Mostrar painel lateral', 'Exibe o chat fixo à direita em telas grandes')}
          <div class="setting-row"><div class="txt"><b>Nome do assistente</b><small>Como ele se apresenta no chat</small></div>
            <input class="input" id="aName" maxlength="40" value="${esc(s.assistantName)}" style="width:140px"></div>
          ${store.aiMode === 'claude' ? '' : `<p class="muted" style="font-size:11px;line-height:1.6;margin:8px 0 0">Para conversar livremente com o Claude, defina <code>ANTHROPIC_API_KEY</code> no arquivo <code>.env</code> do servidor e reinicie.</p>`}
        </div>
        <div class="card">
          <h3 class="title">${icon('download', 15)} Dados</h3><p class="sub">Seus dados são seus.</p>
          <div class="setting-row"><div class="txt"><b>Exportar backup</b><small>Projetos, tarefas, notas e links em JSON</small></div>
            <button class="btn outline sm" id="export">${icon('download', 13)} Exportar</button></div>
          <div class="setting-row"><div class="txt"><b>Versão</b><small>Codeniac</small></div><span class="chip">v${esc(store.version)}</span></div>
          <div class="setting-row"><div class="txt"><b>Encerrar sessão</b><small>Sair deste dispositivo</small></div>
            <button class="btn danger sm" id="logout">${icon('logout', 13)} Sair</button></div>
        </div>
      </div>
    </div>`;

  async function save(patch) {
    try { applySettings(await api.put('/settings', patch)); toast('Configurações salvas', '', 'success'); }
    catch (err) { toast('Erro', err.message, 'error'); }
  }
  el.querySelectorAll('[data-key]').forEach((inp) => inp.addEventListener('change', () => save({ [inp.dataset.key]: inp.checked })));
  el.querySelector('#density').onchange = (e) => save({ density: e.target.checked ? 'compact' : 'comfortable' });
  el.querySelectorAll('[data-accent]').forEach((b) => b.addEventListener('click', () => {
    el.querySelectorAll('[data-accent]').forEach((x) => x.classList.toggle('on', x === b));
    save({ accent: b.dataset.accent });
  }));
  el.querySelector('#customAccent').onchange = (e) => save({ accent: e.target.value });
  el.querySelector('#aName').onchange = (e) => save({ assistantName: e.target.value.trim() || 'Niac' });
  el.querySelector('#logout').onclick = () => { auth.clear(); location.href = '/login'; };
  el.querySelector('#export').onclick = async () => {
    const res = await fetch('/api/export', { headers: { Authorization: `Bearer ${auth.token}` } });
    const blob = await res.blob();
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `codeniac-backup-${new Date().toISOString().slice(0, 10)}.json` });
    a.click(); URL.revokeObjectURL(a.href);
  };
}
