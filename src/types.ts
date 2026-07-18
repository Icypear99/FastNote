export type ViewKey = 'dashboard' | 'tasks' | 'notes' | 'tools' | 'ai' | 'profile';

export type TaskType = 'personal' | 'epic' | 'story' | 'task' | 'bug';
export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface UserProfile {
  id: string;
  localUserKey: string;
  nickname: string;
  avatarUrl: string;
  phone: string;
  email: string;
  phoneBound: boolean;
  emailBound: boolean;
  loginProvider: 'local' | 'password' | 'phone' | 'email' | 'oauth';
  oauthProvider?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  labels: string[];
  dueDate: string;
  parentId?: string;
  orderNum: number;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  status: 'draft' | 'published';
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiConversation {
  id: string;
  title: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface DashboardCard {
  id: string;
  cardType: string;
  cardConfig: Record<string, unknown>;
  isVisible: boolean;
  orderNum: number;
}

export interface Settings {
  aiProvider: 'mock' | 'openai-compatible';
  aiBaseUrl: string;
  aiModel: string;
  aiApiKey: string;
  themeMode: 'system' | 'light' | 'dark';
}

export interface WorkspaceSnapshot {
  profile: UserProfile;
  tasks: Task[];
  notes: Note[];
  conversations: AiConversation[];
  messages: AiMessage[];
  dashboardCards: DashboardCard[];
  settings: Settings;
}
