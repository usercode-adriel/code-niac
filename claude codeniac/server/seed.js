import { db, id, now, save } from './db.js';
import { hashPassword } from './auth.js';

export const APP_VERSION = '1.0.0';

// Histórico de versões publicado como notificação de "atualização do sistema".
export const CHANGELOG = [
  {
    version: '1.0.0',
    title: 'Codeniac 1.0 está no ar 🚀',
    message:
      'Hub de projetos com 7 áreas, quadro kanban, notas, links, assistente IA, upload de imagens, ' +
      'notificações em tempo real e configurações personalizáveis.',
  },
];

export const DEFAULT_PROJECTS = [
  {
    slug: 'trabalhos', name: 'Trabalhos', icon: 'briefcase', color: '#1f8fff',
    tagline: 'Clientes · Entregas', description: 'Clientes, entregas, reuniões e rotinas profissionais.',
    tasks: [
      ['Revisar proposta do cliente', 'high', 'doing'],
      ['Enviar relatório semanal', 'medium', 'todo'],
      ['Organizar reunião de alinhamento', 'low', 'done'],
    ],
  },
  {
    slug: 'programacao', name: 'Programação', icon: 'code', color: '#8b5cf6',
    tagline: 'Código · Estudos', description: 'Projetos de código, estudos de stack e side projects.',
    tasks: [
      ['Refatorar módulo de autenticação', 'high', 'todo'],
      ['Estudar padrões de arquitetura', 'medium', 'doing'],
      ['Configurar CI do side project', 'low', 'todo'],
    ],
  },
  {
    slug: 'criptomoedas', name: 'Criptomoedas', icon: 'bitcoin', color: '#f7931a',
    tagline: 'Carteira · Análises', description: 'Carteira, estratégias, análises on-chain e watchlist.',
    tasks: [
      ['Atualizar planilha da carteira', 'medium', 'todo'],
      ['Estudar estratégia de DCA', 'low', 'done'],
    ],
  },
  {
    slug: 'investimentos', name: 'Investimentos', icon: 'trending', color: '#22c55e',
    tagline: 'Renda fixa · Ações', description: 'Renda fixa, ações, FIIs, metas e rebalanceamento.',
    tasks: [
      ['Rebalancear carteira trimestral', 'high', 'todo'],
      ['Ler relatório de FIIs do mês', 'medium', 'doing'],
    ],
  },
  {
    slug: 'livros', name: 'Livros', icon: 'book', color: '#ef4444',
    tagline: 'Leituras · Resumos', description: 'Lista de leitura, progresso, resumos e citações.',
    tasks: [
      ['Terminar "Clean Architecture"', 'medium', 'doing'],
      ['Escrever resumo do último livro', 'low', 'todo'],
    ],
  },
  {
    slug: 'assets', name: 'Assets', icon: 'layers', color: '#06b6d4',
    tagline: 'Design · Recursos', description: 'Ícones, imagens, fontes, templates e recursos de design.',
    tasks: [
      ['Organizar biblioteca de ícones', 'low', 'todo'],
      ['Criar pasta de mockups', 'medium', 'done'],
    ],
  },
  {
    slug: 'english', name: 'English', icon: 'globe', color: '#eab308',
    tagline: 'Speaking · Vocabulary', description: 'Estudo de inglês: vocabulário, listening, speaking e metas.',
    tasks: [
      ['Praticar speaking 20 min', 'high', 'todo'],
      ['Revisar 30 palavras no flashcard', 'medium', 'doing'],
      ['Assistir episódio sem legenda', 'low', 'done'],
    ],
  },
];

export const DEFAULT_SETTINGS = {
  accent: '#1f8fff',
  density: 'comfortable',      // comfortable | compact
  language: 'pt-BR',
  notifyTasks: true,
  notifySystem: true,
  notifySound: false,
  assistantEnabled: true,
  assistantName: 'Niac',
  showAssistantPanel: true,
  heroAutoplay: true,
};

export function seedUserWorkspace(userId) {
  const d = db();
  DEFAULT_PROJECTS.forEach((p, i) => {
    const projectId = id();
    d.projects.push({
      id: projectId, userId, slug: p.slug, name: p.name, icon: p.icon, color: p.color,
      tagline: p.tagline, description: p.description, cover: null, favorite: i < 2,
      order: i, createdAt: now(), updatedAt: now(),
    });
    p.tasks.forEach(([title, priority, status], j) => {
      const due = new Date(Date.now() + (j + 1 + i) * 86400000).toISOString().slice(0, 10);
      d.tasks.push({
        id: id(), userId, projectId, title, description: '', status, priority,
        dueDate: status === 'done' ? null : due, createdAt: now(), updatedAt: now(),
        completedAt: status === 'done' ? now() : null,
      });
    });
  });
  d.settings[userId] = { ...DEFAULT_SETTINGS };
  d.notifications.push({
    id: id(), userId, type: 'system', title: 'Bem-vindo ao Codeniac 👋',
    message: 'Seus 7 projetos já estão prontos. Converse com o assistente no painel à direita.',
    read: false, createdAt: now(),
  });
  save();
}

export function createUser({ name, email, password, role = 'user' }) {
  const d = db();
  const user = {
    id: id(), name, email: email.toLowerCase(), password: hashPassword(password),
    role, avatar: null, bio: '', title: 'Membro', lastSeenVersion: null, createdAt: now(),
  };
  d.users.push(user);
  seedUserWorkspace(user.id);
  return user;
}

// Usuário demo + publicação automática do changelog como notificação.
export function bootstrap() {
  const d = db();
  if (d.users.length === 0) {
    createUser({
      name: 'Codeniac Admin', email: 'admin@codeniac.dev', password: 'codeniac123', role: 'admin',
    });
    console.log('» Usuário demo criado: admin@codeniac.dev / codeniac123');
  }
  for (const user of d.users) publishPendingUpdates(user);
  save();
}

export function publishPendingUpdates(user) {
  const d = db();
  if (user.lastSeenVersion === APP_VERSION) return;
  // CHANGELOG em ordem cronológica: publica só o que é mais novo que a última versão vista.
  const seenIdx = CHANGELOG.findIndex((c) => c.version === user.lastSeenVersion);
  for (const entry of CHANGELOG.slice(seenIdx + 1)) {
    d.notifications.push({
      id: id(), userId: user.id, type: 'update', title: entry.title,
      message: entry.message, version: entry.version, read: false, createdAt: now(),
    });
  }
  user.lastSeenVersion = APP_VERSION;
}
