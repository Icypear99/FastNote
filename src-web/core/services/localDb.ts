import type {
  AiConversation,
  AiMessage,
  DashboardCard,
  Essay,
  EssayAttachment,
  EssayCategory,
  EssayMutation,
  Project,
  Settings,
  Task,
  TaskPlacement,
  TaskStatus,
  UserProfile,
  WorkspaceSnapshot,
} from '../../shared/types';
import {normalizeTags} from '../../shared/utils/essay';

const STORAGE_KEY = 'fastnote:v2';
const ESSAY_CATEGORY_TAG_MIGRATION_KEY = 'fastnote:migration:essay-categories-to-tags:v1';
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
    content: '# 工作台随笔\n\n- 本地免登录\n- 数据默认存在本机\n- 删除后可在回收站恢复',
    contentFormat: 'markdown',
    contentJson: '',
    summary: '记录个人工作台第一版的边界。',
    categoryId: DEFAULT_CATEGORY_ID,
    tags: ['备忘'],
    status: 'draft',
    isPinned: false,
    createdAt: now(),
    updatedAt: now(),
    attachments: [],
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
    contentFormat: essay.contentFormat || (essay.contentJson ? 'tiptap-json' : 'markdown'),
    contentJson: essay.contentJson || '',
    isPinned: Boolean(essay.isPinned),
    attachments: essay.attachments || [],
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

const migrateEssayCategoriesToTags = (snapshot: WorkspaceSnapshot) => {
  if (localStorage.getItem(ESSAY_CATEGORY_TAG_MIGRATION_KEY) === '1') return snapshot;
  const categoryById = new Map(
    snapshot.essayCategories
      .filter((category) => category.id !== DEFAULT_CATEGORY_ID && category.name.trim())
      .map((category) => [category.id, category.name]),
  );
  snapshot.essays = snapshot.essays.map((essay) => {
    const categoryName = essay.categoryId ? categoryById.get(essay.categoryId) : undefined;
    return categoryName ? {...essay, tags: normalizeTags([...essay.tags, categoryName])} : essay;
  });
  return snapshot;
};

export const readSnapshot = (): WorkspaceSnapshot => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const snapshot = migrateEssayCategoriesToTags(createDefaultSnapshot());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    localStorage.setItem(ESSAY_CATEGORY_TAG_MIGRATION_KEY, '1');
    return snapshot;
  }
  const snapshot = migrateEssayCategoriesToTags(normalizeSnapshot(JSON.parse(raw) as LegacySnapshot));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  localStorage.setItem(ESSAY_CATEGORY_TAG_MIGRATION_KEY, '1');
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
  async restoreProject(idValue: string) {
    const snapshot = readSnapshot();
    const timestamp = now();
    let restoredProject: Project | undefined;
    snapshot.projects = snapshot.projects.map((project) => {
      if (project.id !== idValue) return project;
      restoredProject = {...project, archivedAt: undefined, updatedAt: timestamp};
      return restoredProject;
    });
    if (!restoredProject) throw new Error('项目不存在');
    writeSnapshot(snapshot);
    return restoredProject;
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
    const snapshot = readSnapshot();
    const timestamp = now();
    let archivedTask: Task | undefined;
    snapshot.tasks = snapshot.tasks.map((task) => {
      if (task.id === idValue) {
        archivedTask = {...task, archivedAt: timestamp, updatedAt: timestamp};
        return archivedTask;
      }
      if (task.parentId === idValue) return {...task, parentId: undefined, updatedAt: timestamp};
      return task;
    });
    if (!archivedTask) throw new Error('任务不存在');
    writeSnapshot(snapshot);
    return archivedTask;
  },
  async restoreTask(idValue: string) {
    const snapshot = readSnapshot();
    const task = snapshot.tasks.find((item) => item.id === idValue);
    if (!task) throw new Error('任务不存在');
    if (task.projectId) {
      const project = snapshot.projects.find((item) => item.id === task.projectId);
      if (!project) throw new Error('任务所属项目不存在，请先处理项目关联。');
      if (project.archivedAt) throw new Error('任务所属项目仍在回收站，请先恢复项目。');
    }
    const parent = task.parentId ? snapshot.tasks.find((item) => item.id === task.parentId) : undefined;
    const restoredTask: Task = {
      ...task,
      parentId: parent && !parent.archivedAt ? parent.id : undefined,
      archivedAt: undefined,
      updatedAt: now(),
    };
    snapshot.tasks = snapshot.tasks.map((item) => item.id === idValue ? restoredTask : item);
    writeSnapshot(snapshot);
    return restoredTask;
  },
  async moveTask(idValue: string, status: TaskStatus) {
    return localDb.updateTask({id: idValue, status});
  },
  async reorderTasks(placements: TaskPlacement[]) {
    const snapshot = readSnapshot();
    const taskIds = new Set(snapshot.tasks.map((task) => task.id));
    if (placements.some((placement) => !taskIds.has(placement.id))) {
      throw new Error('待排序任务不存在');
    }
    const placementById = new Map(placements.map((placement) => [placement.id, placement]));
    const updatedAt = now();
    snapshot.tasks = snapshot.tasks.map((task) => {
      const placement = placementById.get(task.id);
      return placement ? {...task, ...placement, updatedAt} : task;
    });
    writeSnapshot(snapshot);
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
  async createEssay(input: EssayMutation) {
    const snapshot = readSnapshot();
    const defaultCategoryId = snapshot.essayCategories.find((category) => !category.archivedAt)?.id;
    const essay: Essay = {
      id: id(),
      title: input.title || '新的随笔',
      content: input.content || '',
      contentFormat: input.contentFormat || 'markdown',
      contentJson: input.contentJson || '',
      summary: input.summary || '',
      categoryId: input.categoryId || defaultCategoryId,
      tags: input.tags || [],
      status: input.status || 'draft',
      isPinned: Boolean(input.isPinned),
      createdAt: now(),
      updatedAt: now(),
      attachments: (input.attachments || []).map((attachment, index) => ({
        ...attachment,
        noteId: undefined,
        orderNum: index,
      })),
    };
    snapshot.essays.unshift(essay);
    writeSnapshot(snapshot);
    return essay;
  },
  async updateEssay(input: EssayMutation & {id: string}) {
    const snapshot = readSnapshot();
    const {attachmentIds: _attachmentIds, ...updates} = input;
    snapshot.essays = snapshot.essays.map((essay) =>
      essay.id === input.id ? {...essay, ...updates, updatedAt: now()} : essay,
    );
    writeSnapshot(snapshot);
    return snapshot.essays.find((essay) => essay.id === input.id)!;
  },
  async archiveEssay(idValue: string) {
    return localDb.updateEssay({id: idValue, archivedAt: now()});
  },
  async restoreEssay(idValue: string) {
    const snapshot = readSnapshot();
    snapshot.essays = snapshot.essays.map((essay) =>
      essay.id === idValue ? {...essay, archivedAt: undefined, updatedAt: now()} : essay,
    );
    writeSnapshot(snapshot);
    return snapshot.essays.find((essay) => essay.id === idValue)!;
  },
  async deleteEssayPermanently(idValue: string) {
    const snapshot = readSnapshot();
    const essay = snapshot.essays.find((item) => item.id === idValue);
    if (!essay) throw new Error('随笔不存在。');
    if (!essay.archivedAt) throw new Error('只能永久删除回收站中的随笔。');
    snapshot.essays = snapshot.essays.filter((item) => item.id !== idValue);
    writeSnapshot(snapshot);
  },
  async emptyEssayTrash() {
    const snapshot = readSnapshot();
    const deletedCount = snapshot.essays.filter((essay) => essay.archivedAt).length;
    snapshot.essays = snapshot.essays.filter((essay) => !essay.archivedAt);
    writeSnapshot(snapshot);
    return deletedCount;
  },
  async importEssayAttachment(input: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    width: number;
    height: number;
    previewDataUrl: string;
  }): Promise<EssayAttachment> {
    const timestamp = now();
    return {
      id: `web-${id()}`,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
      orderNum: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      previewDataUrl: input.previewDataUrl,
    };
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
