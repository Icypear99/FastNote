import {useEffect, useMemo, useRef, useState} from 'react';
import type {CSSProperties, MouseEvent} from 'react';
import {createPortal} from 'react-dom';
import {
  AlignLeft,
  CalendarDays,
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  FolderPlus,
  Gauge,
  LayoutGrid,
  Link2,
  List,
  MoreHorizontal,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type {Project, Task, TaskPriority, TaskStatus} from '../../shared/types';
import {commands} from '../../core/services/commands';

const statuses: TaskStatus[] = ['todo', 'in_progress', 'done'];
const statusText: Record<TaskStatus, string> = {todo: '待办', in_progress: '进行中', done: '已完成'};
const priorities: TaskPriority[] = ['P0', 'P1', 'P2', 'P3'];
const priorityText: Record<TaskPriority, string> = {
  P0: 'P0-紧急',
  P1: 'P1-高',
  P2: 'P2-中',
  P3: 'P3-低',
};

type ViewMode = 'board' | 'list';
type DrawerState =
  | {mode: 'create'; launchStatus: TaskStatus; launchProjectId: string}
  | {mode: 'edit'; taskId: string};

interface TaskDraft {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  parentId: string;
  progress: number;
  description: string;
  projectId: string;
}

const emptyDraft = (status: TaskStatus, projectId: string): TaskDraft => ({
  title: '',
  status,
  priority: 'P2',
  dueDate: '',
  parentId: '',
  progress: 0,
  description: '',
  projectId,
});

const taskDraft = (task: Task): TaskDraft => ({
  title: task.title,
  status: task.status,
  priority: task.priority,
  dueDate: task.dueDate,
  parentId: task.parentId ?? '',
  progress: task.progress,
  description: task.description,
  projectId: task.projectId ?? '',
});

const serializeDraft = (draft: TaskDraft) => JSON.stringify(draft);
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

function formatTimestamp(value: string | undefined) {
  if (!value) return '提交后自动生成';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export default function TasksPage({
  projects,
  tasks,
  run,
}: {
  projects: Project[];
  tasks: Task[];
  run: <T>(action: Promise<T>) => Promise<T>;
}) {
  const activeProjects = useMemo(() => projects.filter((project) => !project.archivedAt), [projects]);
  const activeTasks = useMemo(() => tasks.filter((task) => !task.archivedAt), [tasks]);
  const [selectedProjectId, setSelectedProjectId] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(() => emptyDraft('todo', ''));
  const [draftBaseline, setDraftBaseline] = useState(() => serializeDraft(emptyDraft('todo', '')));
  const [drawerError, setDrawerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [isProjectCreateOpen, setIsProjectCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectColor, setNewProjectColor] = useState('#2563eb');
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);
  const [projectMenuName, setProjectMenuName] = useState('');
  const [projectMenuColor, setProjectMenuColor] = useState('#2563eb');
  const [projectMenuError, setProjectMenuError] = useState('');
  const [projectMenuPosition, setProjectMenuPosition] = useState<{left: number; top: number} | null>(null);
  const projectMenuRef = useRef<HTMLElement>(null);
  const projectMenuTriggerRef = useRef<HTMLButtonElement>(null);

  const filteredTasks = useMemo(() => {
    if (selectedProjectId === 'all') return activeTasks;
    if (selectedProjectId === 'none') return activeTasks.filter((task) => !task.projectId);
    return activeTasks.filter((task) => task.projectId === selectedProjectId);
  }, [activeTasks, selectedProjectId]);

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const selectedProject = activeProjects.find((project) => project.id === selectedProjectId);
  const editingTask = drawer?.mode === 'edit' ? activeTasks.find((task) => task.id === drawer.taskId) : undefined;
  const isDraftDirty = Boolean(drawer) && serializeDraft(draft) !== draftBaseline;

  useEffect(() => {
    if (!projectMenuId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node
        && !projectMenuRef.current?.contains(target)
        && !projectMenuTriggerRef.current?.contains(target)
      ) {
        setProjectMenuId(null);
      }
    };
    const closeOnViewportChange = () => setProjectMenuId(null);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', closeOnViewportChange);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', closeOnViewportChange);
    };
  }, [projectMenuId]);

  useEffect(() => {
    if (!drawer) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (showDiscardConfirm) {
        setShowDiscardConfirm(false);
      } else if (isDraftDirty) {
        setShowDiscardConfirm(true);
      } else {
        setDrawer(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawer, isDraftDirty, showDiscardConfirm]);

  const projectContextId = selectedProject ? selectedProject.id : '';

  const openCreateDrawer = (status: TaskStatus = 'todo') => {
    const nextDraft = emptyDraft(status, projectContextId);
    setDrawer({mode: 'create', launchStatus: status, launchProjectId: projectContextId});
    setDraft(nextDraft);
    setDraftBaseline(serializeDraft(nextDraft));
    setDrawerError('');
    setShowDiscardConfirm(false);
    setIsProjectCreateOpen(false);
    setNewProjectName('');
  };

  const openEditDrawer = (task: Task) => {
    const nextDraft = taskDraft(task);
    setDrawer({mode: 'edit', taskId: task.id});
    setDraft(nextDraft);
    setDraftBaseline(serializeDraft(nextDraft));
    setDrawerError('');
    setShowDiscardConfirm(false);
    setIsProjectCreateOpen(false);
  };

  const closeDrawer = () => {
    setDrawer(null);
    setShowDiscardConfirm(false);
    setDrawerError('');
  };

  const requestDrawerClose = () => {
    if (isSubmitting) return;
    if (isDraftDirty) setShowDiscardConfirm(true);
    else closeDrawer();
  };

  const submitTask = async (continueAdding: boolean) => {
    if (!drawer || isSubmitting) return;
    const title = draft.title.trim();
    if (!title) {
      setDrawerError('请输入任务名称。');
      return;
    }

    setIsSubmitting(true);
    setDrawerError('');
    try {
      const payload = {
        title,
        description: draft.description.trim(),
        status: draft.status,
        priority: draft.priority,
        dueDate: draft.dueDate,
        parentId: draft.parentId,
        progress: Math.min(100, Math.max(0, draft.progress)),
        projectId: draft.projectId,
      };
      if (drawer.mode === 'edit') {
        await run(commands.updateTask({id: drawer.taskId, ...payload}));
        closeDrawer();
      } else {
        await run(commands.createTask({...payload, type: 'task', labels: []}));
        if (continueAdding) {
          const nextDraft = emptyDraft(drawer.launchStatus, drawer.launchProjectId);
          setDraft(nextDraft);
          setDraftBaseline(serializeDraft(nextDraft));
          setIsProjectCreateOpen(false);
          setNewProjectName('');
        } else {
          closeDrawer();
        }
      }
    } catch (error) {
      setDrawerError(errorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const archiveEditingTask = async () => {
    if (!editingTask || isSubmitting) return;
    setIsSubmitting(true);
    setDrawerError('');
    try {
      await run(commands.archiveTask(editingTask.id));
      closeDrawer();
    } catch (error) {
      setDrawerError(errorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const createAndSelectProject = async () => {
    const name = newProjectName.trim();
    if (!name) {
      setDrawerError('请输入项目名称。');
      return;
    }
    setIsSubmitting(true);
    setDrawerError('');
    try {
      const project = await run(commands.createProject({name, color: newProjectColor}));
      setDraft((current) => ({...current, projectId: project.id}));
      setIsProjectCreateOpen(false);
      setNewProjectName('');
    } catch (error) {
      setDrawerError(errorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const openProjectMenu = (event: MouseEvent<HTMLButtonElement>, project: Project) => {
    event.stopPropagation();
    if (projectMenuId === project.id) {
      setProjectMenuId(null);
      setProjectMenuPosition(null);
      return;
    }
    const triggerRect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 250;
    const menuHeight = 220;
    const viewportMargin = 12;
    setProjectMenuPosition({
      left: Math.min(triggerRect.right + 8, window.innerWidth - menuWidth - viewportMargin),
      top: Math.max(viewportMargin, Math.min(triggerRect.top, window.innerHeight - menuHeight - viewportMargin)),
    });
    setProjectMenuId(project.id);
    setProjectMenuName(project.name);
    setProjectMenuColor(project.color);
    setProjectMenuError('');
  };

  const saveProject = async (project: Project) => {
    const name = projectMenuName.trim();
    if (!name) {
      setProjectMenuError('请输入项目名称。');
      return;
    }
    try {
      await run(commands.updateProject({id: project.id, name, color: projectMenuColor}));
      setProjectMenuId(null);
    } catch (error) {
      setProjectMenuError(errorMessage(error));
    }
  };

  const archiveProject = async (project: Project) => {
    const taskCount = activeTasks.filter((task) => task.projectId === project.id).length;
    if (taskCount > 0) {
      setProjectMenuError(`该项目仍有关联任务（${taskCount}），请先转移或清空关联任务。`);
      return;
    }
    try {
      await run(commands.archiveProject(project.id));
      if (selectedProjectId === project.id) setSelectedProjectId('all');
      setProjectMenuId(null);
    } catch (error) {
      setProjectMenuError(errorMessage(error));
    }
  };

  const updateDraft = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => {
    setDraft((current) => ({...current, [key]: value}));
    setDrawerError('');
  };

  return (
    <div className="task-workspace">
      <aside className="project-rail">
        <div className="rail-heading">
          <span>项目</span>
          <strong>{activeProjects.length}</strong>
        </div>
        <button className={`project-filter ${selectedProjectId === 'all' ? 'active' : ''}`} type="button" onClick={() => setSelectedProjectId('all')}>
          <span className="project-color-dot neutral" />
          <span>全部任务</span>
          <small>{activeTasks.length}</small>
        </button>
        <button className={`project-filter ${selectedProjectId === 'none' ? 'active' : ''}`} type="button" onClick={() => setSelectedProjectId('none')}>
          <span className="project-color-dot muted" />
          <span>未分配</span>
          <small>{activeTasks.filter((task) => !task.projectId).length}</small>
        </button>
        <div className="project-filter-list">
          {activeProjects.map((project) => {
            const projectTaskCount = activeTasks.filter((task) => task.projectId === project.id).length;
            const isMenuOpen = projectMenuId === project.id;
            return (
              <div className={`project-filter-row ${selectedProjectId === project.id ? 'active' : ''}`} key={project.id}>
                <button className="project-filter" type="button" onClick={() => setSelectedProjectId(project.id)}>
                  <span className="project-color-dot" style={{'--item-color': project.color} as CSSProperties} />
                  <span>{project.name}</span>
                  <small>{projectTaskCount}</small>
                </button>
                <button ref={isMenuOpen ? projectMenuTriggerRef : undefined} className="project-menu-trigger" type="button" title="管理项目" aria-label={`管理项目 ${project.name}`} onClick={(event) => openProjectMenu(event, project)}>
                  <MoreHorizontal />
                </button>
                {isMenuOpen && projectMenuPosition && createPortal(
                  <section ref={projectMenuRef} className="project-menu-popover" style={projectMenuPosition} aria-label={`编辑项目 ${project.name}`}>
                    <label>
                      <span>项目名称</span>
                      <input value={projectMenuName} onChange={(event) => setProjectMenuName(event.target.value)} />
                    </label>
                    <label>
                      <span>项目颜色</span>
                      <span className="project-color-control">
                        <input type="color" value={projectMenuColor} onChange={(event) => setProjectMenuColor(event.target.value)} />
                        <small>{projectMenuColor}</small>
                      </span>
                    </label>
                    {projectMenuError && <p className="task-form-error">{projectMenuError}</p>}
                    <div className="project-menu-actions">
                      <button className="project-archive-btn" type="button" onClick={() => void archiveProject(project)}>
                        <Trash2 />
                        归档
                      </button>
                      <button className="primary-btn" type="button" onClick={() => void saveProject(project)}>
                        <Save />
                        保存
                      </button>
                    </div>
                  </section>,
                  document.body,
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <section className="task-main">
        <header className="task-module-header">
          <div>
            <span className="section-label">项目任务</span>
            <h2>{selectedProject?.name ?? (selectedProjectId === 'none' ? '未分配任务' : '全部任务')}</h2>
          </div>
          <div className="task-header-actions">
            <div className="segmented" aria-label="任务视图">
              <button className={viewMode === 'board' ? 'active' : ''} type="button" onClick={() => setViewMode('board')}>
                <LayoutGrid />
                看板
              </button>
              <button className={viewMode === 'list' ? 'active' : ''} type="button" onClick={() => setViewMode('list')}>
                <List />
                列表
              </button>
            </div>
            <button className="primary-btn task-add-record-btn" type="button" onClick={() => openCreateDrawer()}>
              <Plus />
              新增记录
            </button>
          </div>
        </header>

        {viewMode === 'board' ? (
          <section className="task-board-scroll">
            <div className="task-board-grid">
              {statuses.map((status) => {
                const statusTasks = filteredTasks.filter((task) => task.status === status);
                return (
                  <section className={`task-board-column status-${status}`} key={status}>
                    <header className="task-board-column-head">
                      <span className={`task-status-pill ${status}`}>{statusText[status]}</span>
                      <small>{statusTasks.length}</small>
                      <button type="button" title={`新增${statusText[status]}任务`} aria-label={`新增${statusText[status]}任务`} onClick={() => openCreateDrawer(status)}>
                        <Plus />
                      </button>
                    </header>
                    <div className="task-board-list">
                      {statusTasks.length === 0 && <span className="task-column-empty">暂无任务</span>}
                      {statusTasks.map((task) => (
                        <TaskCard key={task.id} project={task.projectId ? projectById.get(task.projectId) : undefined} task={task} onOpen={() => openEditDrawer(task)} />
                      ))}
                    </div>
                    <button className="task-column-add" type="button" onClick={() => openCreateDrawer(status)}>
                      <Plus />
                      <span>新增记录</span>
                    </button>
                  </section>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="task-data-table">
            <div className="task-data-row task-data-row-head">
              <span>任务</span>
              <span>项目</span>
              <span>优先级</span>
              <span>状态</span>
              <span>进度</span>
              <span>截止日</span>
            </div>
            <div className="task-data-body">
              {filteredTasks.length === 0 && <div className="task-table-empty">暂无任务</div>}
              {filteredTasks.map((task) => {
                const project = task.projectId ? projectById.get(task.projectId) : undefined;
                return (
                  <button className="task-data-row" type="button" key={task.id} onClick={() => openEditDrawer(task)}>
                    <strong>{task.title}</strong>
                    <span>{project ? <ProjectToken project={project} /> : <small>未分配</small>}</span>
                    <span><PriorityPill priority={task.priority} /></span>
                    <span><span className={`task-status-pill ${task.status}`}>{statusText[task.status]}</span></span>
                    <span className="task-table-progress"><i style={{width: `${task.progress}%`}} /><small>{task.progress}%</small></span>
                    <span>{task.dueDate || '-'}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </section>

      {drawer && (
        <section className="task-drawer-backdrop" aria-label="任务详情遮罩" onMouseDown={requestDrawerClose}>
          <aside className="task-drawer" role="dialog" aria-modal="true" aria-label={drawer.mode === 'create' ? '新增任务' : '编辑任务'} onMouseDown={(event) => event.stopPropagation()}>
            <header className="task-drawer-header">
              <div>
                <span>{drawer.mode === 'create' ? '新增记录' : '任务详情'}</span>
                <h2>{draft.title.trim() || '未命名记录'}</h2>
              </div>
              <button type="button" title="关闭" aria-label="关闭任务详情" onClick={requestDrawerClose}>
                <X />
              </button>
            </header>

            <div className="task-drawer-body">
              <section className="task-detail-form">
                <TaskField icon={<AlignLeft />} label="任务名称">
                  <input aria-label="任务名称" autoFocus value={draft.title} placeholder="请输入任务名称" onChange={(event) => updateDraft('title', event.target.value)} />
                </TaskField>
                <TaskField icon={<CircleCheck />} label="状态">
                  <TaskTagSelect
                    ariaLabel="状态"
                    value={draft.status}
                    options={statuses.map((status) => ({value: status, label: statusText[status], className: `task-status-pill ${status}`}))}
                    onChange={(value) => updateDraft('status', value as TaskStatus)}
                  />
                </TaskField>
                <TaskField icon={<MoreHorizontal />} label="优先级">
                  <TaskTagSelect
                    ariaLabel="优先级"
                    value={draft.priority}
                    options={priorities.map((priority) => ({value: priority, label: priorityText[priority], className: `priority-pill ${priority.toLowerCase()}`}))}
                    onChange={(value) => updateDraft('priority', value as TaskPriority)}
                  />
                </TaskField>
                <TaskField icon={<CalendarDays />} label="截止日期">
                  <input aria-label="截止日期" type="date" value={draft.dueDate} onChange={(event) => updateDraft('dueDate', event.target.value)} />
                </TaskField>
                <TaskField icon={<Link2 />} label="父任务">
                  <select aria-label="父任务" value={draft.parentId} onChange={(event) => updateDraft('parentId', event.target.value)}>
                    <option value="">无父任务</option>
                    {activeTasks.filter((task) => task.id !== editingTask?.id).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                  </select>
                </TaskField>
                <TaskField icon={<Gauge />} label="进度">
                  <div className="task-progress-field">
                    <input aria-label="任务进度" type="range" min="0" max="100" value={draft.progress} onChange={(event) => updateDraft('progress', Number(event.target.value))} />
                    <input aria-label="进度百分比" type="number" min="0" max="100" value={draft.progress} onChange={(event) => updateDraft('progress', Math.min(100, Math.max(0, Number(event.target.value))))} />
                    <span>%</span>
                  </div>
                </TaskField>
                <TaskField icon={<AlignLeft />} label="备注" align="start">
                  <textarea aria-label="备注" rows={4} value={draft.description} placeholder="请输入备注内容" onChange={(event) => updateDraft('description', event.target.value)} />
                </TaskField>
                <TaskField icon={<FolderPlus />} label="所属项目" align="start">
                  <div className="task-project-field">
                    <div>
                      <select aria-label="所属项目" value={draft.projectId} onChange={(event) => updateDraft('projectId', event.target.value)}>
                        <option value="">未分配项目</option>
                        {activeProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                      </select>
                      <button type="button" onClick={() => setIsProjectCreateOpen((value) => !value)}>
                        <Plus />
                        新建项目
                      </button>
                    </div>
                    {isProjectCreateOpen && (
                      <section className="task-inline-project-form">
                        <input aria-label="新项目名称" value={newProjectName} placeholder="项目名称" onChange={(event) => setNewProjectName(event.target.value)} />
                        <label title="项目颜色">
                          <input type="color" value={newProjectColor} onChange={(event) => setNewProjectColor(event.target.value)} />
                        </label>
                        <button className="primary-btn" type="button" disabled={isSubmitting} onClick={() => void createAndSelectProject()}>创建并关联</button>
                      </section>
                    )}
                  </div>
                </TaskField>
                <TaskField icon={<Clock3 />} label="创建时间">
                  <output>{formatTimestamp(editingTask?.createdAt)}</output>
                </TaskField>
                <TaskField icon={<Clock3 />} label="更新时间">
                  <output>{formatTimestamp(editingTask?.updatedAt)}</output>
                </TaskField>
              </section>
              {drawerError && <p className="task-form-error task-drawer-error">{drawerError}</p>}
            </div>

            <footer className="task-drawer-footer">
              {drawer.mode === 'edit' ? (
                <>
                  <button className="task-archive-action" type="button" disabled={isSubmitting} onClick={() => void archiveEditingTask()}>
                    <Trash2 />
                    归档任务
                  </button>
                  <button className="primary-btn" type="button" disabled={isSubmitting} onClick={() => void submitTask(false)}>
                    <Save />
                    {isSubmitting ? '保存中...' : '保存'}
                  </button>
                </>
              ) : (
                <>
                  <span />
                  <div>
                    <button type="button" disabled={isSubmitting} onClick={() => void submitTask(true)}>提交并继续添加</button>
                    <button className="primary-btn" type="button" disabled={isSubmitting} onClick={() => void submitTask(false)}>{isSubmitting ? '提交中...' : '提交'}</button>
                  </div>
                </>
              )}
            </footer>
          </aside>

          {showDiscardConfirm && (
            <section className="task-discard-dialog" role="alertdialog" aria-modal="true" aria-label="放弃未保存修改" onMouseDown={(event) => event.stopPropagation()}>
              <strong>放弃未保存的修改？</strong>
              <p>当前任务内容尚未提交，关闭后这些修改将不会保留。</p>
              <div>
                <button type="button" onClick={() => setShowDiscardConfirm(false)}>继续编辑</button>
                <button className="task-discard-action" type="button" onClick={closeDrawer}>放弃修改</button>
              </div>
            </section>
          )}
        </section>
      )}
    </div>
  );
}

function TaskCard({task, project, onOpen}: {task: Task; project?: Project; onOpen: () => void}) {
  return (
    <button className="task-board-card" type="button" onClick={onOpen}>
      <strong>{task.title}</strong>
      <div className="task-card-pills">
        <span className={`task-status-pill ${task.status}`}>{statusText[task.status]}</span>
        <PriorityPill priority={task.priority} />
      </div>
      {project && <ProjectToken project={project} />}
      <span className="task-card-date">
        <CalendarDays />
        {task.dueDate || '未设置截止日期'}
      </span>
    </button>
  );
}

interface TaskTagOption {
  value: string;
  label: string;
  className: string;
}

function TaskTagSelect({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  options: TaskTagOption[];
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const filteredOptions = options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className={`task-tag-picker ${isOpen ? 'open' : ''}`}>
      <button
        className="task-tag-picker-trigger"
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen((current) => !current);
          setQuery('');
        }}
      >
        <span className={selectedOption.className}>{selectedOption.label}</span>
        <ChevronDown />
      </button>
      {isOpen && (
        <section className="task-tag-picker-menu">
          <label className="task-tag-picker-search">
            <Search />
            <input autoFocus aria-label={`搜索${ariaLabel}选项`} value={query} placeholder="搜索选项" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="task-tag-picker-options" role="listbox" aria-label={`${ariaLabel}选项`}>
            {filteredOptions.map((option) => (
              <button
                className={option.value === value ? 'active' : ''}
                type="button"
                role="option"
                aria-selected={option.value === value}
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                  setQuery('');
                }}
              >
                <span className={option.className}>{option.label}</span>
                {option.value === value && <Check />}
              </button>
            ))}
            {filteredOptions.length === 0 && <span className="task-tag-picker-empty">没有匹配选项</span>}
          </div>
        </section>
      )}
    </div>
  );
}

function PriorityPill({priority}: {priority: TaskPriority}) {
  return <span className={`priority-pill ${priority.toLowerCase()}`}>{priorityText[priority]}</span>;
}

function ProjectToken({project}: {project: Project}) {
  return (
    <span className="project-token">
      <i style={{'--item-color': project.color} as CSSProperties} />
      {project.name}
    </span>
  );
}

function TaskField({
  icon,
  label,
  align = 'center',
  children,
}: {
  icon: React.ReactNode;
  label: string;
  align?: 'center' | 'start';
  children: React.ReactNode;
}) {
  return (
    <div className={`task-detail-field ${align === 'start' ? 'align-start' : ''}`}>
      <span className="task-detail-label">{icon}<span>{label}</span></span>
      <span className="task-detail-control">{children}</span>
    </div>
  );
}
