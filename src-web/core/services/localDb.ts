import type {
  AiConversation,
  AiMessage,
  DashboardCard,
  Essay,
  EssayCategory,
  Project,
  Settings,
  Task,
  TaskStatus,
  UserProfile,
  WorkspaceSnapshot,
} from '../../shared/types';

const STORAGE_KEY = 'fastnote:v2';
const DEFAULT_PROJECT_ID = 'default-project';
const DEFAULT_CATEGORY_ID = 'default-essay-category';
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const clampProgress = (value: number | undefined) => Math.min(100, Math.max(0, Number.isFinite(value) ? value! : 0));

type LegacySnapshot = Partial<WorkspaceSnapshot> & {notes?: Essay[]};

const defaultProfile = (): UserProfile => ({
  id: id(),
  localUserKey: id(),
  nickname: '劲草哥',
  avatarUrl: '',
  phone: '',
  email: '',
  age: '',
  personality: '',
  gender: '',
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
  language: 'zh-CN',
  fontSize: 'default',
  workspacePath: 'localStorage: fastnote:v2',
  sendMessageShortcut: 'Enter',
  globalSearchShortcut: 'Ctrl+K',
  newTaskShortcut: 'Ctrl+Shift+T',
  newEssayShortcut: 'Ctrl+Shift+N',
});

const normalizeThemeMode = (themeMode: Settings['themeMode'] | undefined): Settings['themeMode'] =>
  themeMode === 'dark' ? 'dark' : 'light';

const defaultProject = (): Project => ({
  id: DEFAULT_PROJECT_ID,
  name: '日常工作',
  color: '#2563eb',
  createdAt: now(),
  updatedAt: now(),
});

const defaultCategory = (): EssayCategory => ({
  id: DEFAULT_CATEGORY_ID,
  name: '未分类',
  color: '#64748b',
  orderNum: 1,
  createdAt: now(),
  updatedAt: now(),
});

const defaultCards = (): DashboardCard[] => [
  {id: id(), cardType: 'todo-overview', cardConfig: {}, isVisible: true, orderNum: 1},
  {id: id(), cardType: 'recent-essays', cardConfig: {}, isVisible: true, orderNum: 2},
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
    projectId: DEFAULT_PROJECT_ID,
    labels: ['MVP'],
    dueDate: new Date().toISOString().slice(0, 10),
    progress: 45,
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
    projectId: DEFAULT_PROJECT_ID,
    labels: ['工具箱'],
    dueDate: '',
    progress: 0,
    orderNum: 2,
    createdAt: now(),
    updatedAt: now(),
  },
];

const seedEssays = (): Essay[] => [
  {
    id: id(),
    title: '工作台随笔',
    content: '# 工作台随笔\n\n- 本地免登录\n- 数据默认存在本机\n- 删除操作统一归档',
    summary: '记录个人工作台第一版的边界。',
    categoryId: DEFAULT_CATEGORY_ID,
    tags: ['备忘'],
    status: 'draft',
    createdAt: now(),
    updatedAt: now(),
  },
];

export const createDefaultSnapshot = (): WorkspaceSnapshot => ({
  profile: defaultProfile(),
  projects: [defaultProject()],
  tasks: seedTasks(),
  essays: seedEssays(),
  essayCategories: [defaultCategory()],
  conversations: [],
  messages: [],
  dashboardCards: defaultCards(),
  settings: defaultSettings(),
});

const normalizeSnapshot = (input: LegacySnapshot): WorkspaceSnapshot => {
  const fallback = createDefaultSnapshot();
  const projects = input.projects?.length ? input.projects : fallback.projects;
  const essayCategories = input.essayCategories?.length ? input.essayCategories : fallback.essayCategories;
  const defaultCategoryId = essayCategories.find((item) => !item.archivedAt)?.id ?? DEFAULT_CATEGORY_ID;
  const essays = (input.essays ?? input.notes ?? fallback.essays).map((essay) => ({
    ...essay,
    categoryId: essay.categoryId || defaultCategoryId,
  }));
  return {
    profile: {...fallback.profile, ...input.profile},
    projects,
    tasks: (input.tasks ?? fallback.tasks).map((task) => ({
      ...task,
      projectId: task.projectId || undefined,
      parentId: task.parentId || undefined,
      progress: clampProgress(task.progress),
    })),
    essays,
    essayCategories,
    conversations: input.conversations ?? fallback.conversations,
    messages: input.messages ?? fallback.messages,
    dashboardCards: input.dashboardCards ?? fallback.dashboardCards,
    settings: {...fallback.settings, ...input.settings, themeMode: normalizeThemeMode(input.settings?.themeMode)},
  };
};

export const readSnapshot = (): WorkspaceSnapshot => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const snapshot = createDefaultSnapshot();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return snapshot;
  }
  const snapshot = normalizeSnapshot(JSON.parse(raw) as LegacySnapshot);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  return snapshot;
};

const writeSnapshot = (snapshot: WorkspaceSnapshot) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  return snapshot;
};

export const localDb = {
  async getSnapshot() {
    return readSnapshot();
  },
  async getWorkspacePath() {
    return 'localStorage: fastnote:v2';
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
  async createProject(input: Partial<Project>) {
    const snapshot = readSnapshot();
    const project: Project = {
      id: id(),
      name: input.name || '新项目',
      color: input.color || '#2563eb',
      createdAt: now(),
      updatedAt: now(),
    };
    snapshot.projects.unshift(project);
    writeSnapshot(snapshot);
    return project;
  },
  async updateProject(input: Partial<Project> & {id: string}) {
    const snapshot = readSnapshot();
    snapshot.projects = snapshot.projects.map((project) =>
      project.id === input.id ? {...project, ...input, updatedAt: now()} : project,
    );
    writeSnapshot(snapshot);
    return snapshot.projects.find((project) => project.id === input.id)!;
  },
  async archiveProject(idValue: string) {
    const snapshot = readSnapshot();
    if (snapshot.tasks.some((task) => !task.archivedAt && task.projectId === idValue)) {
      throw new Error('该项目仍有关联任务，请先转移或清空关联任务。');
    }
    return localDb.updateProject({id: idValue, archivedAt: now()});
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
      projectId: input.projectId || undefined,
      labels: input.labels || [],
      dueDate: input.dueDate || '',
      progress: clampProgress(input.progress),
      parentId: input.parentId || undefined,
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
      task.id === input.id
        ? {
            ...task,
            ...input,
            projectId: input.projectId === '' ? undefined : input.projectId ?? task.projectId,
            parentId: input.parentId === '' ? undefined : input.parentId ?? task.parentId,
            progress: input.progress === undefined ? task.progress : clampProgress(input.progress),
            updatedAt: now(),
          }
        : task,
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
  async createEssayCategory(input: Partial<EssayCategory>) {
    const snapshot = readSnapshot();
    const category: EssayCategory = {
      id: id(),
      name: input.name || '新分类',
      color: input.color || '#64748b',
      orderNum: snapshot.essayCategories.length + 1,
      createdAt: now(),
      updatedAt: now(),
    };
    snapshot.essayCategories.push(category);
    writeSnapshot(snapshot);
    return category;
  },
  async updateEssayCategory(input: Partial<EssayCategory> & {id: string}) {
    const snapshot = readSnapshot();
    snapshot.essayCategories = snapshot.essayCategories.map((category) =>
      category.id === input.id ? {...category, ...input, updatedAt: now()} : category,
    );
    writeSnapshot(snapshot);
    return snapshot.essayCategories.find((category) => category.id === input.id)!;
  },
  async archiveEssayCategory(idValue: string) {
    return localDb.updateEssayCategory({id: idValue, archivedAt: now()});
  },
  async createEssay(input: Partial<Essay>) {
    const snapshot = readSnapshot();
    const defaultCategoryId = snapshot.essayCategories.find((category) => !category.archivedAt)?.id;
    const essay: Essay = {
      id: id(),
      title: input.title || '新的随笔',
      content: input.content || '',
      summary: input.summary || '',
      categoryId: input.categoryId || defaultCategoryId,
      tags: input.tags || [],
      status: input.status || 'draft',
      createdAt: now(),
      updatedAt: now(),
    };
    snapshot.essays.unshift(essay);
    writeSnapshot(snapshot);
    return essay;
  },
  async updateEssay(input: Partial<Essay> & {id: string}) {
    const snapshot = readSnapshot();
    snapshot.essays = snapshot.essays.map((essay) =>
      essay.id === input.id ? {...essay, ...input, updatedAt: now()} : essay,
    );
    writeSnapshot(snapshot);
    return snapshot.essays.find((essay) => essay.id === input.id)!;
  },
  async archiveEssay(idValue: string) {
    return localDb.updateEssay({id: idValue, archivedAt: now()});
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
