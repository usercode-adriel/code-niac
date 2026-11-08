// Assistente IA "especialista do sistema".
// - Com credenciais da Anthropic: usa Claude com ferramentas que leem/alteram tarefas do Codeniac.
// - Sem credenciais: usa um motor local de intenções (funciona offline).
import Anthropic from '@anthropic-ai/sdk';
import { db, now, save } from './db.js';
import { DEFAULT_SETTINGS } from './seed.js';
import { createTask, updateTask, projectStats } from './routes/api.js';

const MODEL = process.env.CODENIAC_AI_MODEL || 'claude-opus-5-5';
const EFFORT = process.env.CODENIAC_AI_EFFORT || 'low'; // chat responde bem em "low"; suba para "medium"/"high" se quiser
const MAX_API_MESSAGES = 80; // ao passar disso, inicia uma conversa nova (histórico só cresce, nunca é editado)

const hasCredentials = () =>
  Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);

export function assistantMode() {
  const forced = (process.env.AI_PROVIDER || '').toLowerCase();
  if (forced === 'local') return 'local';
  if (forced === 'claude') return 'claude';
  return hasCredentials() ? 'claude' : 'local';
}

let client = null;
const getClient = () => (client ??= new Anthropic());

// ---------- Contexto do usuário ----------
function snapshot(user) {
  const d = db();
  const projects = d.projects.filter((p) => p.userId === user.id).sort((a, b) => a.order - b.order);
  const tasks = d.tasks.filter((t) => t.userId === user.id);
  const today = new Date().toISOString().slice(0, 10);
  return { projects, tasks, today };
}

function contextBlock(user) {
  const { projects, tasks, today } = snapshot(user);
  const lines = projects.map((p) => {
    const st = projectStats(p.id, user.id);
    const open = tasks.filter((t) => t.projectId === p.id && t.status !== 'done')
      .map((t) => `    - [${t.id}] ${t.title} (${t.status}, prioridade ${t.priority}${t.dueDate ? `, prazo ${t.dueDate}` : ''})`);
    return `- ${p.name} (slug: ${p.slug}) — ${st.progress}% concluído, ${st.done}/${st.total} tarefas\n${open.join('\n')}`;
  });
  return `<contexto_codeniac data="${today}" usuario="${user.name}">\n${lines.join('\n')}\n</contexto_codeniac>`;
}

const SYSTEM = `Você é o assistente integrado do Codeniac, um hub pessoal de projetos e tarefas.
O usuário organiza a vida em projetos (Trabalhos, Programação, Criptomoedas, Investimentos, Livros, Assets, English e outros que ele criar).
Cada mensagem do usuário chega acompanhada de um bloco <contexto_codeniac> com o estado atual dos projetos e das tarefas abertas (com IDs). Use-o como fonte da verdade.

Como agir:
- Responda em português do Brasil, de forma direta e amigável. Mensagens curtas: o painel de chat é estreito.
- Ajude a priorizar, planejar a semana, quebrar metas em tarefas e explicar como usar o Codeniac.
- Quando o usuário pedir para criar, concluir ou mover tarefas, use as ferramentas. Confirme em uma frase o que foi feito.
- Se faltar informação essencial (por exemplo, em qual projeto criar), pergunte antes de agir.
- Sobre criptomoedas e investimentos: ajude com organização, estudo e planejamento, sem recomendar compra ou venda de ativos específicos.

Recursos do sistema que você pode explicar: dashboard com destaque rotativo, páginas de projeto com quadro kanban (arrastar e soltar), notas e links, upload de capa do projeto e foto de perfil, notificações em tempo real, busca global (atalho "/"), configurações de cor de destaque e densidade, exportação de backup em JSON.`;

const TOOLS = [
  {
    name: 'list_tasks',
    description: 'Lista tarefas do usuário, opcionalmente filtradas por projeto e status. Use quando o contexto não bastar (ex.: tarefas concluídas).',
    strict: true,
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string', description: 'Slug do projeto, ou "all" para todos.' },
        status: { type: 'string', enum: ['all', 'todo', 'doing', 'done'] },
      },
      required: ['project_slug', 'status'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_task',
    description: 'Cria uma nova tarefa em um projeto do usuário.',
    strict: true,
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string', description: 'Slug do projeto (veja o contexto).' },
        title: { type: 'string', description: 'Título curto da tarefa.' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        due_date: { type: 'string', description: 'Prazo no formato AAAA-MM-DD, ou string vazia se não houver.' },
      },
      required: ['project_slug', 'title', 'priority', 'due_date'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_task_status',
    description: 'Muda o status de uma tarefa existente (todo = a fazer, doing = em andamento, done = concluída).',
    strict: true,
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'ID da tarefa (entre colchetes no contexto).' },
        status: { type: 'string', enum: ['todo', 'doing', 'done'] },
      },
      required: ['task_id', 'status'],
      additionalProperties: false,
    },
  },
];

// Com eager_input_streaming a API não valida a entrada: validamos aqui antes de executar.
function validate(name, input) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return `Ferramenta desconhecida: ${name}`;
  if (!input || typeof input !== 'object') return 'Entrada inválida';
  for (const key of tool.input_schema.required) {
    const spec = tool.input_schema.properties[key];
    if (typeof input[key] !== 'string') return `Campo "${key}" ausente ou inválido`;
    if (spec.enum && !spec.enum.includes(input[key])) return `Valor inválido para "${key}"`;
  }
  return null;
}

function runTool(user, name, input) {
  const { projects, tasks } = snapshot(user);
  const bySlug = (slug) => projects.find((p) => p.slug === slug);
  if (name === 'list_tasks') {
    let list = tasks;
    if (input.project_slug !== 'all') {
      const p = bySlug(input.project_slug);
      if (!p) throw new Error(`Projeto "${input.project_slug}" não existe`);
      list = list.filter((t) => t.projectId === p.id);
    }
    if (input.status !== 'all') list = list.filter((t) => t.status === input.status);
    return list.slice(0, 50).map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate }));
  }
  if (name === 'create_task') {
    const p = bySlug(input.project_slug);
    if (!p) throw new Error(`Projeto "${input.project_slug}" não existe`);
    const t = createTask(user.id, { projectId: p.id, title: input.title, priority: input.priority, dueDate: input.due_date });
    return { created: { id: t.id, title: t.title, project: p.name } };
  }
  if (name === 'update_task_status') {
    const t = updateTask(user.id, input.task_id, { status: input.status });
    return { updated: { id: t.id, title: t.title, status: t.status } };
  }
  throw new Error('Ferramenta desconhecida');
}

// ---------- Histórico ----------
export function getThread(userId) {
  const d = db();
  d.threads[userId] ??= { api: [], display: [] };
  return d.threads[userId];
}

export function clearThread(userId) {
  db().threads[userId] = { api: [], display: [] };
  save();
}

// ---------- Claude ----------
async function runClaude(user, thread, text, write) {
  if (thread.api.length > MAX_API_MESSAGES) thread.api = []; // nova conversa (append-only dentro de cada uma)
  const checkpoint = thread.api.length;
  thread.api.push({ role: 'user', content: [{ type: 'text', text: contextBlock(user) }, { type: 'text', text }] });
  let answer = '';
  try {
    for (let step = 0; step < 6; step++) {
      const stream = getClient().beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        tools: TOOLS,
        output_config: { effort: EFFORT },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        messages: thread.api,
      });
      stream.on('text', (delta) => { answer += delta; write({ type: 'text', text: delta }); });
      const msg = await stream.finalMessage();
      thread.api.push({ role: 'assistant', content: msg.content });

      if (msg.stop_reason === 'refusal') {
        const note = 'Não posso ajudar com esse pedido. Que tal reformular?';
        answer += note; write({ type: 'text', text: note });
        break;
      }
      if (msg.stop_reason !== 'tool_use') break;

      const results = [];
      for (const block of msg.content) {
        if (block.type !== 'tool_use') continue;
        const error = validate(block.name, block.input);
        if (error) {
          results.push({ type: 'tool_result', tool_use_id: block.id, content: `INVALID_INPUT: ${error}`, is_error: true });
          continue;
        }
        try {
          const out = runTool(user, block.name, block.input);
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) });
          write({ type: 'tool', name: block.name });
        } catch (e) {
          results.push({ type: 'tool_result', tool_use_id: block.id, content: e.message, is_error: true });
        }
      }
      thread.api.push({ role: 'user', content: results });
      if (answer && !answer.endsWith('\n')) { answer += '\n\n'; write({ type: 'text', text: '\n\n' }); }
    }
  } catch (err) {
    thread.api.length = checkpoint; // descarta o turno que falhou (nenhuma resposta foi gravada depois dele)
    throw err;
  }
  return answer.trim();
}

// ---------- Motor local (sem API) ----------
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const PRIO_LABEL = { high: 'alta', medium: 'média', low: 'baixa' };

function runLocal(user, text) {
  const { projects, tasks, today } = snapshot(user);
  const q = norm(text);
  const findProject = () => projects.find((p) => q.includes(norm(p.name)) || q.includes(p.slug));
  const open = tasks.filter((t) => t.status !== 'done');
  const pName = (id) => projects.find((p) => p.id === id)?.name || '';

  // Criar tarefa: "criar tarefa X em Projeto"
  const create = text.match(/(?:cri(?:e|ar)|adicion(?:e|ar)|nova)\s+(?:uma\s+)?tarefa\s*:?\s*["“]?(.+?)["”]?\s+(?:em|no|na|para)\s+(.+)$/i);
  if (create) {
    const target = norm(create[2]);
    const p = projects.find((x) => target.includes(norm(x.name)) || target.includes(x.slug));
    if (!p) return `Não encontrei o projeto "${create[2]}". Projetos disponíveis: ${projects.map((x) => x.name).join(', ')}.`;
    const priority = /urgente|alta/.test(q) ? 'high' : 'medium';
    const t = createTask(user.id, { projectId: p.id, title: create[1].replace(/\s+(urgente|com prioridade alta)$/i, ''), priority });
    return `Pronto! Criei a tarefa **${t.title}** em **${p.name}** (prioridade ${PRIO_LABEL[priority]}).`;
  }

  // Concluir tarefa: "concluir X"
  const complete = text.match(/(?:conclu(?:ir|a|i)|finaliz(?:ar|e|ei)|marc(?:ar|e) como feit[ao])\s+(?:a\s+tarefa\s+)?["“]?(.+?)["”]?$/i);
  if (complete) {
    const term = norm(complete[1]);
    const t = open.find((x) => norm(x.title).includes(term));
    if (!t) return `Não achei tarefa aberta parecida com "${complete[1]}".`;
    updateTask(user.id, t.id, { status: 'done' });
    return `Feito ✅ **${t.title}** foi marcada como concluída em ${pName(t.projectId)}.`;
  }

  if (/atrasad|vencid/.test(q)) {
    const late = open.filter((t) => t.dueDate && t.dueDate < today);
    if (!late.length) return 'Nenhuma tarefa atrasada. Tudo em dia! 🎉';
    return `Você tem ${late.length} tarefa(s) atrasada(s):\n${late.map((t) => `• ${t.title} — ${pName(t.projectId)} (prazo ${t.dueDate})`).join('\n')}`;
  }

  if (/prioridad|foco|urgente|comecar|começar|o que fa[cç]o|hoje/.test(q)) {
    const order = { high: 0, medium: 1, low: 2 };
    const top = [...open].sort((a, b) => order[a.priority] - order[b.priority] || (a.dueDate || '9').localeCompare(b.dueDate || '9')).slice(0, 5);
    if (!top.length) return 'Você não tem tarefas abertas. Que tal criar uma nova meta?';
    return `Sugestão de foco para hoje:\n${top.map((t, i) => `${i + 1}. ${t.title} — ${pName(t.projectId)} (${PRIO_LABEL[t.priority]}${t.dueDate ? `, ${t.dueDate}` : ''})`).join('\n')}`;
  }

  const p = findProject();
  if (p) {
    const st = projectStats(p.id, user.id);
    const list = open.filter((t) => t.projectId === p.id);
    return `**${p.name}** está ${st.progress}% concluído (${st.done}/${st.total}).\n` +
      (list.length ? `Abertas:\n${list.map((t) => `• ${t.title} (${t.status === 'doing' ? 'em andamento' : 'a fazer'})`).join('\n')}` : 'Nenhuma tarefa aberta. 🎉');
  }

  if (/resumo|progresso|status|visao geral|overview|como (estou|esta)/.test(q)) {
    return `Resumo do seu hub:\n${projects.map((x) => { const s = projectStats(x.id, user.id); return `• ${x.name}: ${s.progress}% (${s.done}/${s.total})`; }).join('\n')}\n\nTotal de tarefas abertas: ${open.length}.`;
  }

  if (/pendent|abert|tarefas/.test(q)) {
    if (!open.length) return 'Nenhuma tarefa pendente!';
    return `Você tem ${open.length} tarefa(s) aberta(s). As próximas:\n${open.slice(0, 6).map((t) => `• ${t.title} — ${pName(t.projectId)}`).join('\n')}`;
  }

  if (/^(oi|ola|bom dia|boa tarde|boa noite|hey|hello)/.test(q)) {
    return `Olá, ${user.name.split(' ')[0]}! Posso resumir seus projetos, sugerir prioridades ou criar tarefas. O que vamos fazer?`;
  }

  return 'Estou no modo local (sem conexão com a IA). Posso:\n' +
    '• "resumo" — progresso de todos os projetos\n' +
    '• "prioridades" — o que fazer hoje\n' +
    '• "tarefas atrasadas"\n' +
    '• "como está Programação?"\n' +
    '• "criar tarefa Estudar SQL em Programação"\n' +
    '• "concluir Estudar SQL"\n\n' +
    'Configure ANTHROPIC_API_KEY no servidor para conversar livremente com o Claude.';
}

// ---------- Entrada pública ----------
export async function chat(user, text, write) {
  const settings = { ...DEFAULT_SETTINGS, ...(db().settings[user.id] || {}) };
  if (!settings.assistantEnabled) {
    const msg = 'O assistente está desativado nas Configurações.';
    write({ type: 'text', text: msg });
    return msg;
  }
  const thread = getThread(user.id);
  thread.display.push({ role: 'user', text, at: now() });

  let answer;
  let mode = assistantMode();
  if (mode === 'claude') {
    try {
      answer = await runClaude(user, thread, text, write);
    } catch (err) {
      console.error('[assistente] Falha ao chamar Claude:', err?.status || '', err?.message);
      const reason = err instanceof Anthropic.AuthenticationError ? 'credenciais inválidas'
        : err instanceof Anthropic.RateLimitError ? 'limite de uso atingido'
        : err instanceof Anthropic.APIConnectionError ? 'sem conexão com a API' : 'erro na API';
      write({ type: 'notice', text: `IA indisponível (${reason}). Respondendo no modo local.` });
      mode = 'local';
    }
  }
  if (mode === 'local') {
    answer = runLocal(user, text);
    // simula streaming para manter a mesma experiência
    for (const chunk of answer.match(/.{1,12}/gs) || []) {
      write({ type: 'text', text: chunk });
      await new Promise((r) => setTimeout(r, 12));
    }
  }
  thread.display.push({ role: 'assistant', text: answer, at: now(), mode });
  if (thread.display.length > 200) thread.display = thread.display.slice(-200);
  save();
  return answer;
}
