import {useMemo, useState} from 'react';
import type {CSSProperties} from 'react';
import type {Project, Task, TaskPriority, TaskStatus, TaskType} from '../../shared/types';
import {commands} from '../../core/services/commands';

const statuses: TaskStatus[] = ['todo', 'in_progress', 'done'];
const statusText: Record<TaskStatus, string> = {todo: '待办', in_progress: '进行中', done: '完成'};
const taskTypes: TaskType[] = ['personal', 'epic', 'story', 'task', 'bug'];
const priorities: TaskPriority[] = ['P0', 'P1', 'P2', 'P3'];

export default function TasksPage({
  projects,
  tasks,
  run,
}: {
  projects: Project[];
  tasks: Task[];
  run: <T>(action: Promise<T>) => Promise<T>;
}) {
  const activeProjects = projects.filter((project) => !project.archivedAt);
  const [selectedProjectId, setSelectedProjectId] = useState('all');
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [projectName, setProjectName] = useState('');
  const [projectColor, setProjectColor] = useState('#2563eb');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>('task');
  const [priority, setPriority] = useState<TaskPriority>('P2');
  const [taskProjectId, setTaskProjectId] = useState(activeProjects[0]?.id ?? '');
  const [dueDate, setDueDate] = useState('');
  const [labels, setLabels] = useState('');

  const activeTasks = tasks.filter((task) => !task.archivedAt);
  const filteredTasks = useMemo(() => {
    if (selectedProjectId === 'all') return activeTasks;
    if (selectedProjectId === 'none') return activeTasks.filter((task) => !task.projectId);
    return activeTasks.filter((task) => task.projectId === selectedProjectId);
  }, [activeTasks, selectedProjectId]);

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const selectedProject = activeProjects.find((project) => project.id === selectedProjectId);

  const createProject = async () => {
    if (!projectName.trim()) return;
    const project = await run(commands.createProject({name: projectName.trim(), color: projectColor}));
    setSelectedProjectId(project.id);
    setTaskProjectId(project.id);
    setProjectName('');
  };

  const updateSelectedProject = async () => {
    if (!selectedProject || !projectName.trim()) return;
    await run(commands.updateProject({id: selectedProject.id, name: projectName.trim(), color: projectColor}));
    setProjectName('');
  };

  const archiveSelectedProject = async () => {
    if (!selectedProject) return;
    await run(commands.archiveProject(selectedProject.id));
    setSelectedProjectId('all');
  };

  const createTask = async () => {
    if (!title.trim()) return;
    await run(
      commands.createTask({
        title: title.trim(),
        type,
        priority,
        projectId: taskProjectId || undefined,
        dueDate,
        labels: labels
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      }),
    );
    setTitle('');
    setLabels('');
    setDueDate('');
  };

  const startProjectEdit = (project: Project) => {
    setSelectedProjectId(project.id);
    setProjectName(project.name);
    setProjectColor(project.color);
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
        {activeProjects.map((project) => (
          <button
            className={`project-filter ${selectedProjectId === project.id ? 'active' : ''}`}
            key={project.id}
            type="button"
            onClick={() => startProjectEdit(project)}
          >
            <span className="project-color-dot" style={{'--item-color': project.color} as CSSProperties} />
            <span>{project.name}</span>
            <small>{activeTasks.filter((task) => task.projectId === project.id).length}</small>
          </button>
        ))}

        <section className="compact-form">
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="项目名称" />
          <div className="color-field">
            <input type="color" value={projectColor} onChange={(event) => setProjectColor(event.target.value)} />
            <span>{projectColor}</span>
          </div>
          <div className="compact-actions">
            <button className="primary-btn" type="button" onClick={selectedProject ? updateSelectedProject : createProject}>
              {selectedProject ? '保存项目' : '新建项目'}
            </button>
            {selectedProject && (
              <button type="button" onClick={archiveSelectedProject}>
                归档
              </button>
            )}
          </div>
        </section>
      </aside>

      <section className="task-main">
        <header className="module-header">
          <div>
            <span className="section-label">项目任务</span>
            <h2>{selectedProject?.name ?? (selectedProjectId === 'none' ? '未分配任务' : '全部任务')}</h2>
          </div>
          <div className="segmented">
            <button className={viewMode === 'board' ? 'active' : ''} type="button" onClick={() => setViewMode('board')}>
              看板
            </button>
            <button className={viewMode === 'list' ? 'active' : ''} type="button" onClick={() => setViewMode('list')}>
              列表
            </button>
          </div>
        </header>

        <section className="form-panel task-create-panel">
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="任务标题" />
          <select value={taskProjectId} onChange={(event) => setTaskProjectId(event.target.value)}>
            <option value="">未分配项目</option>
            {activeProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <select value={type} onChange={(event) => setType(event.target.value as TaskType)}>
            {taskTypes.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
            {priorities.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          <input value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="标签，逗号分隔" />
          <button className="primary-btn" type="button" onClick={createTask}>
            新建
          </button>
        </section>

        {viewMode === 'board' ? (
          <section className="board-grid">
            {statuses.map((status) => (
              <div className="board-column" key={status}>
                <div className="board-title">
                  <span>{statusText[status]}</span>
                  <small>{filteredTasks.filter((task) => task.status === status).length}</small>
                </div>
                <div className="board-list">
                  {filteredTasks
                    .filter((task) => task.status === status)
                    .map((task) => (
                      <TaskCard key={task.id} project={task.projectId ? projectById.get(task.projectId) : undefined} task={task} projects={activeProjects} run={run} />
                    ))}
                </div>
              </div>
            ))}
          </section>
        ) : (
          <section className="data-table">
            <div className="data-row data-row-head">
              <span>任务</span>
              <span>项目</span>
              <span>优先级</span>
              <span>状态</span>
              <span>截止日</span>
              <span>操作</span>
            </div>
            {filteredTasks.map((task) => (
              <div className="data-row" key={task.id}>
                <strong>{task.title}</strong>
                <ProjectSelect task={task} projects={activeProjects} run={run} />
                <span className={`priority-pill ${task.priority.toLowerCase()}`}>{task.priority}</span>
                <select value={task.status} onChange={(event) => run(commands.moveTask(task.id, event.target.value as TaskStatus))}>
                  {statuses.map((item) => (
                    <option key={item} value={item}>
                      {statusText[item]}
                    </option>
                  ))}
                </select>
                <span>{task.dueDate || '-'}</span>
                <button type="button" onClick={() => run(commands.archiveTask(task.id))}>
                  归档
                </button>
              </div>
            ))}
          </section>
        )}
      </section>
    </div>
  );
}

function TaskCard({
  task,
  project,
  projects,
  run,
}: {
  task: Task;
  project?: Project;
  projects: Project[];
  run: <T>(action: Promise<T>) => Promise<T>;
}) {
  return (
    <article className="task-item">
      <div className="task-item-header">
        <strong>{task.title}</strong>
        <span className={`priority-pill ${task.priority.toLowerCase()}`}>{task.priority}</span>
      </div>
      <p>{task.description || '无描述'}</p>
      <div className="task-meta">
        <span>{task.type}</span>
        {project && (
          <span className="project-token">
            <i style={{'--item-color': project.color} as CSSProperties} />
            {project.name}
          </span>
        )}
        {task.labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="row-actions">
        <ProjectSelect task={task} projects={projects} run={run} />
        <select value={task.status} onChange={(event) => run(commands.moveTask(task.id, event.target.value as TaskStatus))}>
          {statuses.map((item) => (
            <option key={item} value={item}>
              {statusText[item]}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => run(commands.archiveTask(task.id))}>
          归档
        </button>
      </div>
    </article>
  );
}

function ProjectSelect({
  task,
  projects,
  run,
}: {
  task: Task;
  projects: Project[];
  run: <T>(action: Promise<T>) => Promise<T>;
}) {
  return (
    <select value={task.projectId ?? ''} onChange={(event) => run(commands.updateTask({id: task.id, projectId: event.target.value || undefined}))}>
      <option value="">未分配</option>
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
        </option>
      ))}
    </select>
  );
}
