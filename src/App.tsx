import {useEffect, useMemo, useState} from 'react';
import type {ChangeEvent, ReactNode} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Markdown} from '@astryxdesign/core/Markdown';
import {SideNav, SideNavHeading, SideNavItem, SideNavSection} from '@astryxdesign/core/SideNav';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Token} from '@astryxdesign/core/Token';
import {TopNav, TopNavHeading} from '@astryxdesign/core/TopNav';
import {
  Bot,
  CheckCircle2,
  ClipboardList,
  Home,
  NotebookPen,
  Plus,
  Save,
  Settings,
  Sparkles,
  UserRound,
  Wrench,
} from 'lucide-react';
import clsx from 'clsx';
import {commands} from './lib/commands';
import {useUiStore} from './store';
import type {
  AiMessage,
  Note,
  Settings as AppSettings,
  Task,
  TaskPriority,
  TaskStatus,
  TaskType,
  UserProfile,
  ViewKey,
  WorkspaceSnapshot,
} from './types';

const snapshotKey = ['workspace-snapshot'];

const statusLabels: Record<TaskStatus, string> = {
  todo: '待办',
  in_progress: '进行中',
  done: '完成',
};

const taskTypes: TaskType[] = ['personal', 'epic', 'story', 'task', 'bug'];
const priorities: TaskPriority[] = ['P0', 'P1', 'P2', 'P3'];
const statuses: TaskStatus[] = ['todo', 'in_progress', 'done'];

const priorityVariant: Record<TaskPriority, 'red' | 'orange' | 'blue' | 'neutral'> = {
  P0: 'red',
  P1: 'orange',
  P2: 'blue',
  P3: 'neutral',
};

export function App() {
  const queryClient = useQueryClient();
  const {activeView, setActiveView} = useUiStore();
  const {data, isLoading, error} = useQuery({
    queryKey: snapshotKey,
    queryFn: commands.getSnapshot,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({queryKey: snapshotKey});
  };

  const run = async <T,>(action: Promise<T>) => {
    const result = await action;
    await refresh();
    return result;
  };

  if (isLoading || !data) {
    return <LoadingShell />;
  }

  if (error) {
    return (
      <AppShell contentPadding={4}>
        <section className="empty-panel">
          <h1>工作台启动失败</h1>
          <p>{error instanceof Error ? error.message : '未知错误'}</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell
      height="fill"
      variant="section"
      contentPadding={0}
      topNav={<WorkspaceTopNav profile={data.profile} />}
      sideNav={<WorkspaceSideNav activeView={activeView} onChange={setActiveView} snapshot={data} />}
    >
      <section className="workspace-frame">
        {activeView === 'dashboard' && <DashboardView snapshot={data} onNavigate={setActiveView} />}
        {activeView === 'tasks' && <TasksView tasks={data.tasks} run={run} />}
        {activeView === 'notes' && <NotesView notes={data.notes} run={run} />}
        {activeView === 'tools' && <ToolsView />}
        {activeView === 'ai' && (
          <AiView
            conversations={data.conversations}
            messages={data.messages}
            settings={data.settings}
            run={run}
          />
        )}
        {activeView === 'profile' && <ProfileView profile={data.profile} run={run} />}
      </section>
    </AppShell>
  );
}

function LoadingShell() {
  return (
    <AppShell contentPadding={4}>
      <section className="empty-panel">
        <h1>正在打开个人空间</h1>
        <p>首次启动会初始化本地用户档案和默认卡片。</p>
      </section>
    </AppShell>
  );
}

function WorkspaceTopNav({profile}: {profile: UserProfile}) {
  return (
    <TopNav
      label="个人空间顶部导航"
      heading={<TopNavHeading heading="个人空间工作台" subheading="本地优先 · 免登录" logo={<Sparkles size={22} />} />}
      endContent={
        <section className="top-profile" aria-label="当前用户">
          <Avatar profile={profile} size="sm" />
          <span>{profile.nickname || '本地用户'}</span>
        </section>
      }
    />
  );
}

function WorkspaceSideNav({
  activeView,
  onChange,
  snapshot,
}: {
  activeView: ViewKey;
  onChange: (view: ViewKey) => void;
  snapshot: WorkspaceSnapshot;
}) {
  const activeTasks = snapshot.tasks.filter((task) => !task.archivedAt && task.status !== 'done').length;
  return (
    <SideNav
      header={<SideNavHeading heading="WorkSpace" subheading="个人效率中枢" icon={<Sparkles size={20} />} />}
      collapsible={{defaultIsCollapsed: false, buttonLabel: '折叠导航'}}
    >
      <SideNavSection title="工作区">
        <NavItem view="dashboard" label="首页工作台" icon={Home} activeView={activeView} onChange={onChange} />
        <NavItem
          view="tasks"
          label="待办管理"
          icon={ClipboardList}
          activeView={activeView}
          onChange={onChange}
          endContent={<Badge label={activeTasks} variant="neutral" />}
        />
        <NavItem view="notes" label="笔记创作" icon={NotebookPen} activeView={activeView} onChange={onChange} />
        <NavItem view="tools" label="工具箱" icon={Wrench} activeView={activeView} onChange={onChange} />
        <NavItem view="ai" label="AI 助手" icon={Bot} activeView={activeView} onChange={onChange} />
      </SideNavSection>
      <SideNavSection title="个人">
        <NavItem view="profile" label="个人信息" icon={UserRound} activeView={activeView} onChange={onChange} />
      </SideNavSection>
    </SideNav>
  );
}

function NavItem({
  view,
  label,
  icon,
  activeView,
  onChange,
  endContent,
}: {
  view: ViewKey;
  label: string;
  icon: typeof Home;
  activeView: ViewKey;
  onChange: (view: ViewKey) => void;
  endContent?: ReactNode;
}) {
  return (
    <SideNavItem
      label={label}
      icon={icon}
      selectedIcon={icon}
      isSelected={activeView === view}
      href={`#${view}`}
      endContent={endContent}
      onClick={(event) => {
        event.preventDefault();
        onChange(view);
      }}
    />
  );
}

function DashboardView({
  snapshot,
  onNavigate,
}: {
  snapshot: WorkspaceSnapshot;
  onNavigate: (view: ViewKey) => void;
}) {
  const activeTasks = snapshot.tasks.filter((task) => !task.archivedAt);
  const today = new Date().toISOString().slice(0, 10);
  const todayTasks = activeTasks.filter((task) => task.dueDate === today);
  const recentNotes = snapshot.notes.filter((note) => !note.archivedAt).slice(0, 3);
  const doneCount = activeTasks.filter((task) => task.status === 'done').length;

  return (
    <PageFrame
      eyebrow="Dashboard"
      title={`早上好，${snapshot.profile.nickname || '本地用户'}`}
      description="把今日计划、创作入口、开发工具和 AI 助手放在一个安静的桌面里。"
      action={<Button label="新建任务" icon={<Plus size={16} />} variant="primary" onClick={() => onNavigate('tasks')} />}
    >
      <section className="dashboard-grid">
        <MetricCard label="活跃任务" value={activeTasks.length} detail={`${doneCount} 个已完成`} />
        <MetricCard label="今日到期" value={todayTasks.length} detail="来自本地待办数据" />
        <MetricCard label="笔记草稿" value={snapshot.notes.filter((note) => note.status === 'draft' && !note.archivedAt).length} detail="Markdown 创作" />
        <MetricCard label="AI 会话" value={snapshot.conversations.filter((item) => !item.archivedAt).length} detail={snapshot.settings.aiProvider} />
      </section>
      <section className="two-column">
        <Card padding={5}>
          <section className="panel-heading">
            <h2>今日焦点</h2>
            <Button label="去看板" variant="ghost" size="sm" onClick={() => onNavigate('tasks')} />
          </section>
          <section className="row-list">
            {todayTasks.length === 0 ? (
              <p className="muted">今天没有到期任务，可以从待办看板安排新的节奏。</p>
            ) : (
              todayTasks.map((task) => <TaskRow key={task.id} task={task} />)
            )}
          </section>
        </Card>
        <Card padding={5}>
          <section className="panel-heading">
            <h2>最近笔记</h2>
            <Button label="去创作" variant="ghost" size="sm" onClick={() => onNavigate('notes')} />
          </section>
          <section className="row-list">
            {recentNotes.map((note) => (
              <article className="compact-row" key={note.id}>
                <strong>{note.title}</strong>
                <p>{note.summary || note.content.slice(0, 72)}</p>
              </article>
            ))}
          </section>
        </Card>
      </section>
      <section className="quick-grid">
        <QuickAction title="JSON 格式化" detail="校验、缩进、复制" onClick={() => onNavigate('tools')} icon={<Wrench />} />
        <QuickAction title="AI 摘要" detail="文章、需求、代码解释" onClick={() => onNavigate('ai')} icon={<Bot />} />
        <QuickAction title="个人资料" detail="昵称、头像、绑定信息" onClick={() => onNavigate('profile')} icon={<UserRound />} />
      </section>
    </PageFrame>
  );
}

function MetricCard({label, value, detail}: {label: string; value: number; detail: string}) {
  return (
    <Card padding={5}>
      <article className="metric-card">
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{detail}</p>
      </article>
    </Card>
  );
}

function QuickAction({title, detail, icon, onClick}: {title: string; detail: string; icon: ReactNode; onClick: () => void}) {
  return (
    <button className="quick-action" type="button" onClick={onClick}>
      <span className="quick-icon">{icon}</span>
      <strong>{title}</strong>
      <small>{detail}</small>
    </button>
  );
}

function TasksView({
  tasks,
  run,
}: {
  tasks: Task[];
  run: <T>(action: Promise<T>) => Promise<T>;
}) {
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    type: 'personal' as TaskType,
    priority: 'P2' as TaskPriority,
    dueDate: '',
    labels: '',
  });
  const activeTasks = tasks.filter((task) => !task.archivedAt);

  const createTask = async () => {
    if (!draft.title.trim()) return;
    await run(
      commands.createTask({
        ...draft,
        labels: toList(draft.labels),
      }),
    );
    setDraft({...draft, title: '', description: '', labels: ''});
  };

  return (
    <PageFrame
      eyebrow="Tasks"
      title="待办管理"
      description="个人任务、敏捷需求和 Bug 都收在同一块看板里，删除语义统一归档。"
      action={<Button label="创建任务" icon={<Plus size={16} />} variant="primary" onClick={createTask} />}
    >
      <Card padding={5}>
        <section className="form-grid">
          <TextInput label="任务标题" value={draft.title} onChange={(value) => setDraft({...draft, title: value})} placeholder="例如：完成首页卡片配置" />
          <TextInput label="标签" value={draft.labels} onChange={(value) => setDraft({...draft, labels: value})} placeholder="逗号分隔，如 AI,MVP" />
          <label className="field-shell">
            <span>类型</span>
            <select value={draft.type} onChange={(event) => setDraft({...draft, type: event.target.value as TaskType})}>
              {taskTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="field-shell">
            <span>优先级</span>
            <select value={draft.priority} onChange={(event) => setDraft({...draft, priority: event.target.value as TaskPriority})}>
              {priorities.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </label>
          <TextInput label="截止日期" value={draft.dueDate} onChange={(value) => setDraft({...draft, dueDate: value})} placeholder="YYYY-MM-DD" />
        </section>
        <TextArea label="任务描述" value={draft.description} rows={3} onChange={(value) => setDraft({...draft, description: value})} />
      </Card>
      <section className="kanban-grid">
        {statuses.map((status) => (
          <section className="kanban-column" key={status}>
            <header>
              <h2>{statusLabels[status]}</h2>
              <Badge label={activeTasks.filter((task) => task.status === status).length} variant="neutral" />
            </header>
            <section className="task-stack">
              {activeTasks
                .filter((task) => task.status === status)
                .map((task) => (
                  <TaskCard key={task.id} task={task} run={run} />
                ))}
            </section>
          </section>
        ))}
      </section>
    </PageFrame>
  );
}

function TaskCard({task, run}: {task: Task; run: <T>(action: Promise<T>) => Promise<T>}) {
  return (
    <article className="task-card">
      <header>
        <strong>{task.title}</strong>
        <Badge label={task.priority} variant={priorityVariant[task.priority]} />
      </header>
      <p>{task.description || '没有描述'}</p>
      <section className="token-row">
        <Token label={task.type} size="sm" color="gray" />
        {task.labels.map((label) => (
          <Token key={label} label={label} size="sm" color="blue" />
        ))}
      </section>
      <footer>
        <label className="mini-select">
          <span>状态</span>
          <select value={task.status} onChange={(event) => run(commands.moveTask(task.id, event.target.value as TaskStatus))}>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        <Button label="归档" variant="ghost" size="sm" onClick={() => run(commands.archiveTask(task.id))} />
      </footer>
    </article>
  );
}

function TaskRow({task}: {task: Task}) {
  return (
    <article className="compact-row">
      <strong>{task.title}</strong>
      <p>
        {task.type} · {task.priority} · {statusLabels[task.status]}
      </p>
    </article>
  );
}

function NotesView({notes, run}: {notes: Note[]; run: <T>(action: Promise<T>) => Promise<T>}) {
  const {selectedNoteId, setSelectedNoteId} = useUiStore();
  const activeNotes = notes.filter((note) => !note.archivedAt);
  const selected = activeNotes.find((note) => note.id === selectedNoteId) ?? activeNotes[0];
  const [draft, setDraft] = useState<Note | undefined>(selected);

  useEffect(() => {
    setDraft(selected);
  }, [selected?.id]);

  const createNote = async () => {
    const note = await run(commands.createNote({title: '新的 Markdown 笔记', content: '# 新笔记\n\n从这里开始写。'}));
    setSelectedNoteId(note.id);
  };

  const saveNote = async () => {
    if (!draft) return;
    await run(commands.updateNote({...draft, tags: draft.tags}));
  };

  return (
    <PageFrame
      eyebrow="Notes"
      title="笔记创作"
      description="Markdown 编辑、实时预览、草稿和摘要先跑通，附件与版本历史后续扩展。"
      action={<Button label="新建笔记" icon={<Plus size={16} />} variant="primary" onClick={createNote} />}
    >
      <section className="split-layout">
        <aside className="note-list" aria-label="笔记列表">
          {activeNotes.map((note) => (
            <button
              className={clsx('note-row', note.id === selected?.id && 'is-active')}
              key={note.id}
              type="button"
              onClick={() => setSelectedNoteId(note.id)}
            >
              <strong>{note.title}</strong>
              <small>{note.summary || note.content.slice(0, 48)}</small>
            </button>
          ))}
        </aside>
        <section className="editor-panel">
          {draft ? (
            <>
              <section className="editor-toolbar">
                <TextInput label="标题" value={draft.title} onChange={(value) => setDraft({...draft, title: value})} />
                <TextInput
                  label="标签"
                  value={draft.tags.join(',')}
                  onChange={(value) => setDraft({...draft, tags: toList(value)})}
                  placeholder="逗号分隔"
                />
                <Button label="保存" icon={<Save size={16} />} variant="primary" onClick={saveNote} />
                <Button label="归档" variant="ghost" onClick={() => run(commands.archiveNote(draft.id))} />
              </section>
              <section className="editor-grid">
                <TextArea label="Markdown 内容" value={draft.content} rows={18} onChange={(value) => setDraft({...draft, content: value})} />
                <Card padding={5}>
                  <section className="markdown-preview">
                    <h2>实时预览</h2>
                    <Markdown headingLevelStart={3}>{draft.content || '还没有内容。'}</Markdown>
                  </section>
                </Card>
              </section>
              <TextArea label="摘要" value={draft.summary} rows={3} onChange={(value) => setDraft({...draft, summary: value})} />
            </>
          ) : (
            <section className="empty-panel">
              <h2>还没有笔记</h2>
              <Button label="创建第一篇笔记" variant="primary" onClick={createNote} />
            </section>
          )}
        </section>
      </section>
    </PageFrame>
  );
}

function ToolsView() {
  const [tool, setTool] = useState('json');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');

  const runTool = () => {
    try {
      setOutput(runToolAction(tool, input));
    } catch (error) {
      setOutput(error instanceof Error ? error.message : '处理失败');
    }
  };

  return (
    <PageFrame eyebrow="Tools" title="工具箱" description="核心开发工具优先在前端离线执行，减少服务端压力。">
      <Card padding={5}>
        <section className="tool-header">
          <label className="field-shell">
            <span>工具</span>
            <select value={tool} onChange={(event) => setTool(event.target.value)}>
              <option value="json">JSON 格式化</option>
              <option value="base64-encode">Base64 编码</option>
              <option value="base64-decode">Base64 解码</option>
              <option value="url-encode">URL 编码</option>
              <option value="url-decode">URL 解码</option>
              <option value="timestamp">时间戳转换</option>
              <option value="jwt">JWT 解析</option>
              <option value="uuid">UUID 生成</option>
            </select>
          </label>
          <Button label="运行" variant="primary" onClick={runTool} />
        </section>
        <section className="tool-grid">
          <TextArea label="输入" value={input} rows={16} onChange={setInput} />
          <TextArea label="输出" value={output} rows={16} onChange={setOutput} />
        </section>
      </Card>
    </PageFrame>
  );
}

function AiView({
  conversations,
  messages,
  settings,
  run,
}: {
  conversations: WorkspaceSnapshot['conversations'];
  messages: AiMessage[];
  settings: AppSettings;
  run: <T>(action: Promise<T>) => Promise<T>;
}) {
  const {selectedConversationId, setSelectedConversationId} = useUiStore();
  const [prompt, setPrompt] = useState('');
  const [config, setConfig] = useState(settings);
  const activeConversationId = selectedConversationId ?? conversations[0]?.id;
  const visibleMessages = messages.filter((message) => message.conversationId === activeConversationId).slice(-20);

  useEffect(() => {
    setConfig(settings);
  }, [settings]);

  const saveSettings = () => run(commands.updateSettings(config));
  const send = async () => {
    if (!prompt.trim()) return;
    const result = await run(commands.sendMessage(prompt, activeConversationId));
    setPrompt('');
    setSelectedConversationId(result.conversation.id);
  };

  return (
    <PageFrame eyebrow="AI" title="AI 助手" description="支持 10 轮上下文的本地会话壳，配置模型后可切到真实 OpenAI-compatible 接口。">
      <section className="ai-layout">
        <aside className="conversation-list" aria-label="AI 对话列表">
          <button className="note-row is-active" type="button" onClick={() => setSelectedConversationId(undefined)}>
            <strong>新对话</strong>
            <small>从快捷指令开始</small>
          </button>
          {conversations
            .filter((item) => !item.archivedAt)
            .map((conversation) => (
              <button
                className={clsx('note-row', conversation.id === activeConversationId && 'is-active')}
                key={conversation.id}
                type="button"
                onClick={() => setSelectedConversationId(conversation.id)}
              >
                <strong>{conversation.title}</strong>
                <small>{new Date(conversation.updatedAt).toLocaleString()}</small>
              </button>
            ))}
        </aside>
        <section className="chat-panel">
          <Card padding={5}>
            <section className="settings-grid">
              <label className="field-shell">
                <span>Provider</span>
                <select value={config.aiProvider} onChange={(event) => setConfig({...config, aiProvider: event.target.value as AppSettings['aiProvider']})}>
                  <option value="mock">Mock 本地模式</option>
                  <option value="openai-compatible">OpenAI-compatible</option>
                </select>
              </label>
              <TextInput label="Base URL" value={config.aiBaseUrl} onChange={(value) => setConfig({...config, aiBaseUrl: value})} />
              <TextInput label="模型" value={config.aiModel} onChange={(value) => setConfig({...config, aiModel: value})} />
              <TextInput label="API Key" type="password" value={config.aiApiKey} onChange={(value) => setConfig({...config, aiApiKey: value})} isOptional />
              <Button label="保存配置" icon={<Settings size={16} />} onClick={saveSettings} />
            </section>
          </Card>
          <section className="prompt-actions">
            {['/summarize 总结这段内容', '/explain 解释这段代码', '/optimize 优化这个方案'].map((item) => (
              <button key={item} type="button" onClick={() => setPrompt(item)}>
                {item}
              </button>
            ))}
          </section>
          <section className="message-list" aria-label="AI 消息">
            {visibleMessages.length === 0 ? (
              <p className="muted">还没有消息。可以用快捷指令开始，也可以直接输入问题。</p>
            ) : (
              visibleMessages.map((message) => (
                <article className={clsx('chat-bubble', message.role)} key={message.id}>
                  <strong>{message.role === 'user' ? '你' : 'AI 助手'}</strong>
                  <Markdown density="compact" headingLevelStart={4}>
                    {message.content}
                  </Markdown>
                </article>
              ))
            )}
          </section>
          <section className="composer">
            <TextArea label="输入消息" value={prompt} rows={4} onChange={setPrompt} placeholder="Enter 发送暂未绑定，先点击发送。" />
            <Button label="发送" icon={<Sparkles size={16} />} variant="primary" onClick={send} />
          </section>
        </section>
      </section>
    </PageFrame>
  );
}

function ProfileView({profile, run}: {profile: UserProfile; run: <T>(action: Promise<T>) => Promise<T>}) {
  const [draft, setDraft] = useState(profile);
  const phoneError = draft.phone && !/^1\d{10}$/.test(draft.phone) ? '手机号需为 11 位大陆手机号' : undefined;
  const emailError = draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email) ? '邮箱格式不正确' : undefined;

  useEffect(() => {
    setDraft(profile);
  }, [profile]);

  const handleAvatarFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDraft({...draft, avatarUrl: String(reader.result)});
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (phoneError || emailError) return;
    await run(commands.updateProfile(draft));
  };

  return (
    <PageFrame
      eyebrow="Profile"
      title="个人信息"
      description="本地免登录也保留身份资料、手机号/邮箱绑定状态和后续登录扩展口。"
      action={<Button label="保存资料" icon={<Save size={16} />} variant="primary" onClick={save} />}
    >
      <section className="profile-layout">
        <Card padding={6}>
          <section className="profile-card">
            <Avatar profile={draft} size="lg" />
            <h2>{draft.nickname || '本地用户'}</h2>
            <p>登录方式：本地免登录</p>
            <section className="token-row">
              <Token label={draft.phoneBound ? '手机号已绑定' : '手机号未绑定'} color={draft.phoneBound ? 'green' : 'gray'} />
              <Token label={draft.emailBound ? '邮箱已绑定' : '邮箱未绑定'} color={draft.emailBound ? 'green' : 'gray'} />
              <Token label="OAuth 预留" color="blue" />
            </section>
          </section>
        </Card>
        <Card padding={6}>
          <section className="profile-form">
            <TextInput label="昵称" value={draft.nickname} onChange={(value) => setDraft({...draft, nickname: value})} isRequired />
            <TextInput label="头像 URL" value={draft.avatarUrl} onChange={(value) => setDraft({...draft, avatarUrl: value})} isOptional />
            <label className="field-shell">
              <span>选择本地头像</span>
              <input type="file" accept="image/*" onChange={handleAvatarFile} />
            </label>
            <TextInput
              label="手机号"
              value={draft.phone}
              onChange={(value) => setDraft({...draft, phone: value})}
              status={phoneError ? {type: 'error', message: phoneError} : draft.phone ? {type: 'success', message: '保存后标记为已绑定'} : undefined}
              isOptional
            />
            <TextInput
              label="邮箱"
              type="email"
              value={draft.email}
              onChange={(value) => setDraft({...draft, email: value})}
              status={emailError ? {type: 'error', message: emailError} : draft.email ? {type: 'success', message: '保存后标记为已绑定'} : undefined}
              isOptional
            />
          </section>
        </Card>
      </section>
    </PageFrame>
  );
}

function PageFrame({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="page-frame">
      <header className="page-header">
        <section>
          <small>{eyebrow}</small>
          <h1>{title}</h1>
          <p>{description}</p>
        </section>
        {action}
      </header>
      {children}
    </section>
  );
}

function Avatar({profile, size}: {profile: UserProfile; size: 'sm' | 'lg'}) {
  const initials = (profile.nickname || '本地').slice(0, 2);
  return profile.avatarUrl ? (
    <img className={clsx('avatar', size)} src={profile.avatarUrl} alt={`${profile.nickname} 的头像`} />
  ) : (
    <span className={clsx('avatar', size)} aria-label={`${profile.nickname} 的头像`}>
      {initials}
    </span>
  );
}

function toList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function runToolAction(tool: string, input: string) {
  if (tool === 'json') return JSON.stringify(JSON.parse(input), null, 2);
  if (tool === 'base64-encode') return btoa(unescape(encodeURIComponent(input)));
  if (tool === 'base64-decode') return decodeURIComponent(escape(atob(input)));
  if (tool === 'url-encode') return encodeURIComponent(input);
  if (tool === 'url-decode') return decodeURIComponent(input);
  if (tool === 'timestamp') {
    const value = input.trim() || String(Date.now());
    const numeric = Number(value.length === 10 ? `${value}000` : value);
    const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(value);
    return [`ISO: ${date.toISOString()}`, `本地时间: ${date.toLocaleString()}`, `毫秒时间戳: ${date.getTime()}`].join('\n');
  }
  if (tool === 'jwt') {
    const [, payload] = input.split('.');
    if (!payload) throw new Error('JWT 至少需要包含 header.payload.signature');
    return JSON.stringify(JSON.parse(decodeURIComponent(escape(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))))), null, 2);
  }
  if (tool === 'uuid') return crypto.randomUUID();
  return input;
}
