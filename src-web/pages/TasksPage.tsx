import {useState} from 'react';
import type {Task, TaskPriority, TaskStatus, TaskType} from '../types';
import {commands} from '../services/commands';

const statuses: TaskStatus[] = ['todo', 'in_progress', 'done'];
const statusText: Record<TaskStatus, string> = {todo: '待办', in_progress: '进行中', done: '完成'};
const taskTypes: TaskType[] = ['personal', 'epic', 'story', 'task', 'bug'];
const priorities: TaskPriority[] = ['P0', 'P1', 'P2', 'P3'];

export default function TasksPage({tasks, run}: {tasks: Task[]; run: <T>(action: Promise<T>) => Promise<T>}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>('personal');
  const [priority, setPriority] = useState<TaskPriority>('P2');
  const [labels, setLabels] = useState('');

  const activeTasks = tasks.filter((task) => !task.archivedAt);

  const create = async () => {
    if (!title.trim()) return;
    await run(commands.createTask({title, type, priority, labels: labels.split(',').map((item) => item.trim()).filter(Boolean)}));
    setTitle('');
    setLabels('');
  };

  return (
    <div className="page-stack">
      <section className="content-section">
        <div className="section-label">新建任务</div>
        <div className="form-panel task-create-panel">
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="任务标题" />
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
          <input value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="标签，逗号分隔" />
          <button className="dark-btn" type="button" onClick={create}>
            新建
          </button>
        </div>
      </section>

      <section className="board-grid">
        {statuses.map((status) => (
          <div className="board-column" key={status}>
            <div className="board-title">
              <span>{statusText[status]}</span>
              <small>{activeTasks.filter((task) => task.status === status).length}</small>
            </div>
            <div className="board-list">
              {activeTasks
                .filter((task) => task.status === status)
                .map((task) => (
                  <article className="task-item" key={task.id}>
                    <div className="task-item-header">
                      <strong>{task.title}</strong>
                      <span className={`priority-pill ${task.priority.toLowerCase()}`}>{task.priority}</span>
                    </div>
                    <p>{task.description || '无描述'}</p>
                    <div className="task-meta">
                      <span>{task.type}</span>
                      {task.labels.map((label) => (
                        <span key={label}>{label}</span>
                      ))}
                    </div>
                    <div className="row-actions">
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
                ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
