import { api } from '../api.js';
import { icon } from '../icons.js';
import { esc, avatar, toast, formData, bindUploadZone, validateImage } from '../ui.js';
import { store, setUser } from '../store.js';

export async function render(el) {
  const paint = () => {
    const u = store.user;
    const total = store.projects.reduce((a, p) => a + p.stats.total, 0);
    const done = store.projects.reduce((a, p) => a + p.stats.done, 0);
    el.innerHTML = `
      <div class="page-head"><div><h1>Meu perfil</h1><p>Edite suas informações, foto e senha.</p></div></div>
      <div class="two-col">
        <div class="stack">
          <div class="card profile-side">
            ${avatar(u, 'xl')}
            <h3>${esc(u.name)}</h3>
            <p class="muted" style="margin:4px 0 0;font-size:11.5px">${esc(u.title || 'Membro')} · ${esc(u.email)}</p>
            ${u.bio ? `<p style="color:var(--text-2);font-size:12px;line-height:1.6;margin:14px 0 0">${esc(u.bio)}</p>` : ''}
            <div class="kpis" style="justify-content:center">
              <div><b>${store.projects.length}</b><span>Projetos</span></div>
              <div><b>${total}</b><span>Tarefas</span></div>
              <div><b>${done}</b><span>Concluídas</span></div>
            </div>
          </div>
          <div class="card">
            <h3 class="title">Foto de perfil</h3><p class="sub">PNG, JPG, WEBP ou GIF até 5 MB.</p>
            <div class="upload-zone" id="avatarZone" tabindex="0" role="button" aria-label="Enviar foto de perfil">
              ${icon('upload', 22)}<div style="margin-top:6px">Arraste uma imagem ou <b style="color:var(--accent)">clique para enviar</b></div></div>
            <input type="file" id="avatarFile" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
            ${u.avatar ? `<button class="btn outline sm" id="removeAvatar" style="margin-top:12px;width:100%">${icon('trash', 13)} Remover foto</button>` : ''}
          </div>
        </div>
        <div class="stack">
          <div class="card">
            <h3 class="title">Informações pessoais</h3><p class="sub">Como você aparece no Codeniac.</p>
            <form class="form" id="infoForm">
              <div class="form-row">
                <div class="field"><label for="pfName">Nome</label><input id="pfName" name="name" maxlength="80" required value="${esc(u.name)}"></div>
                <div class="field"><label for="pfTitle">Cargo / título</label><input id="pfTitle" name="title" maxlength="60" value="${esc(u.title || '')}" placeholder="Ex.: Desenvolvedor"></div>
              </div>
              <div class="field"><label for="pfEmail">E-mail</label><input id="pfEmail" name="email" type="email" required value="${esc(u.email)}"></div>
              <div class="field"><label for="pfBio">Bio</label><textarea id="pfBio" name="bio" maxlength="400" placeholder="Fale um pouco sobre você e seus objetivos">${esc(u.bio || '')}</textarea></div>
              <div class="form-actions"><button class="btn primary">Salvar alterações</button></div>
            </form>
          </div>
          <div class="card">
            <h3 class="title">Segurança</h3><p class="sub">Altere sua senha de acesso.</p>
            <form class="form" id="pwdForm">
              <div class="field"><label for="pwCur">Senha atual</label><input id="pwCur" name="current" type="password" autocomplete="current-password" required></div>
              <div class="form-row">
                <div class="field"><label for="pwNew">Nova senha</label><input id="pwNew" name="next" type="password" autocomplete="new-password" minlength="6" required></div>
                <div class="field"><label for="pwConf">Confirmar nova senha</label><input id="pwConf" name="confirm" type="password" autocomplete="new-password" required></div>
              </div>
              <div class="form-actions"><button class="btn primary">${icon('shield', 13)} Alterar senha</button></div>
            </form>
          </div>
        </div>
      </div>`;

    bindUploadZone(el.querySelector('#avatarZone'), el.querySelector('#avatarFile'), async (file) => {
      if (!validateImage(file)) return;
      try { const r = await api.upload('/profile/avatar', file); setUser(r.user); toast('Foto atualizada', '', 'success'); paint(); }
      catch (err) { toast('Erro no upload', err.message, 'error'); }
    });
    el.querySelector('#removeAvatar')?.addEventListener('click', async () => {
      const r = await api.del('/profile/avatar'); setUser(r.user); paint();
    });
    el.querySelector('#infoForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { const r = await api.put('/profile', formData(e.target)); setUser(r.user); toast('Perfil atualizado', '', 'success'); paint(); }
      catch (err) { toast('Erro', err.message, 'error'); }
    });
    el.querySelector('#pwdForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      if (d.next !== d.confirm) { toast('As senhas não conferem', '', 'error'); return; }
      try { await api.put('/profile/password', d); toast('Senha alterada', '', 'success'); e.target.reset(); }
      catch (err) { toast('Erro', err.message, 'error'); }
    });
  };
  paint();
}
