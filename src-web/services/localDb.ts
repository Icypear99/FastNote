import type {
  AiConversation,
  AiMessage,
  DashboardCard,
  Note,
  Settings,
  Task,
  TaskStatus,
  UserProfile,
  WorkspaceSnapshot,
} from '../types';

const STORAGE_KEY = 'fastnote:v2';
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

const defaultProfile = (): UserProfile => ({
  id: id(),
  localUserKey: id(),
  nickname: '劲草哥',
  avatarUrl: '',
  phone: '',
  email: '',
  phoneBound: false,
  emailBound: false,
  loginProvider: 'local',
  createdAt: now(),
  updatedAt: now(),
});

const defaultSettings = (): Settings => ({
  aiProvider: 'mock',
  aiBaseUrl: 'https://api.openai.com/v1/chat/completions',
  aiModel: 'gpt-4.1-mini',
  aiApiKey: '',
  themeMode: 'light',
});

const defaultCards = (): DashboardCard[] => [
  {id: id(), cardType: 'todo-overview', cardConfig: {}, isVisible: true, orderNum: 1},
  {id: id(), cardType: 'recent-notes', cardConfig: {}, isVisible: true, orderNum: 2},
  {id: id(), cardType: 'quick-entry', cardConfig: {}, isVisible: true, orderNum: 3},
];

const seedTasks = (): Task[] => [
  {
    id: id(),
    title: '完善个人工作台第一版',
    description: '确认桌面端启动、页面访问、模块点击和本地数据闭环。',
    type: 'story',
    priority: 'P0',
    status: 'in_progress',
    labels: ['MVP'],
    dueDate: new Date().toISOString().slice(0, 10),
    orderNum: 1,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: id(),
    title: '整理常用工具入口',
    description: 'JSON、编码、时间戳、JWT、UUID 等工具保持离线可用。',
    type: 'task',
    priority: 'P1',
    status: 'todo',
    labels: ['工具箱'],
    dueDate: '',
    orderNum: 2,
    createdAt: now(),
    updatedAt: now(),
  },
];

const seedNotes = (): Note[] => [
  {
    id: id(),
    title: '工作台备忘',
    content: '# 工作台备忘\n\n- 本地免登录\n- 数据默认存在本机\n- 删除操作统一归档',
    summary: '记录个人工作台第一版的边界。',
    tags: ['备忘'],
    status: 'draft',
    createdAt: now(),
    updatedAt: now(),
  },
];

export const createDefaultSnapshot = (): WorkspaceSnapshot => ({
  profile: defaultProfile(),
  tasks: seedTasks(),
  notes: seedNotes(),
  conversations: [],
  messages: [],
  dashboardCards: defaultCards(),
  settings: defaultSettings(),
});

export const readSnapshot = (): WorkspaceSnapshot => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const snapshot = createDefaultSnapshot();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return snapshot;
  }
  return {...createDefaultSnapshot(), ...JSON.parse(raw)} as WorkspaceSnapshot;
};

const writeSnapshot = (snapshot: WorkspaceSnapshot) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  return snapshot;
};

export const localDb = {
  async getSnapshot() {
    return readSnapshot();
  },
  async updateProfile(input: Partial<UserProfile>) {
    const snapshot = readSnapshot();
    snapshot.profile = {
      ...snapshot.profile,
      ...input,
      phoneBound: Boolean(input.phone ?? snapshot.profile.phone),
      emailBound: Boolean(input.email ?? snapshot.profile.email),
      updatedAt: now(),
    };
    return writeSnapshot(snapshot).profile;
  },
  async createTask(input: Partial<Task>) {
    const snapshot = readSnapshot();
    const task: Task = {
      id: id(),
      title: input.title || '未命名任务',
      description: input.description || '',
      type: input.type || 'personal',
      priority: input.priority || 'P2',
      status: input.status || 'todo',
      labels: input.labels || [],
      dueDate: input.dueDate || '',
      parentId: input.parentId,
      orderNum: snapshot.tasks.length + 1,
      createdAt: now(),
      updatedAt: now(),
    };
    snapshot.tasks.unshift(task);
    writeSnapshot(snapshot);
    return task;
  },
  async updateTask(input: Partial<Task> & {id: string}) {
    const snapshot = readSnapshot();
    snapshot.tasks = snapshot.tasks.map((task) =>
      task.id === input.id ? {...task, ...input, updatedAt: now()} : task,
    );
    writeSnapshot(snapshot);
    return snapshot.tasks.find((task) => task.id === input.id)!;
  },
  async archiveTask(idValue: string) {
    return localDb.updateTask({id: idValue, archivedAt: now()});
  },
  async moveTask(idValue: string, status: TaskStatus) {
    return localDb.updateTask({id: idValue, status});
  },
  async createNote(input: Partial<Note>) {
    const snapshot = readSnapshot();
    const note: Note = {
      id: id(),
      title: input.title || '未命名笔记',
      content: input.content || '',
      summary: input.summary || '',
      tags: input.tags || [],
      status: input.status || 'draft',
      createdAt: now(),
      updatedAt: now(),
    };
    snapshot.notes.unshift(note);
    writeSnapshot(snapshot);
    return note;
  },
  async updateNote(input: Partial<Note> & {id: string}) {
    const snapshot = readSnapshot();
    snapshot.notes = snapshot.notes.map((note) =>
      note.id === input.id ? {...note, ...input, updatedAt: now()} : note,
    );
    writeSnapshot(snapshot);
    return snapshot.notes.find((note) => note.id === input.id)!;
  },
  async archiveNote(idValue: string) {
    return localDb.updateNote({id: idValue, archivedAt: now()});
  },
  async updateSettings(input: Partial<Settings>) {
    const snapshot = readSnapshot();
    snapshot.settings = {...snapshot.settings, ...input};
    return writeSnapshot(snapshot).settings;
  },
  async sendMessage(content: string, conversationId?: string) {
    const snapshot = readSnapshot();
    const currentConversation =
      snapshot.conversations.find((item) => item.id === conversationId) ??
      ({
        id: id(),
        title: content.slice(0, 24) || '新的对话',
        createdAt: now(),
        updatedAt: now(),
      } satisfies AiConversation);
    if (!snapshot.conversations.some((item) => item.id === currentConversation.id)) {
      snapshot.conversations.unshift(currentConversation);
    }
    const userMessage: AiMessage = {
      id: id(),
      conversationId: currentConversation.id,
      role: 'user',
      content,
      createdAt: now(),
    };
    const assistantMessage: AiMessage = {
      id: id(),
      conversationId: currentConversation.id,
      role: 'assistant',
      content: `收到：${content}\n\n当前为本地模式。配置模型后会使用桌面端后端转发请求。`,
      createdAt: now(),
    };
    snapshot.messages.push(userMessage, assistantMessage);
    snapshot.conversations = snapshot.conversations.map((item) =>
      item.id === currentConversation.id ? {...item, updatedAt: now()} : item,
    );
    writeSnapshot(snapshot);
    return {conversation: currentConversation, messages: [userMessage, assistantMessage]};
  },
};
