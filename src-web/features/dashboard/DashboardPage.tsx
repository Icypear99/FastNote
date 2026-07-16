import {BookOpenText, Bot, BriefcaseBusiness, CheckCircle2, Clock3, Wrench} from 'lucide-react';
import type {CSSProperties} from 'react';
import type {PanelKey, Project, TaskStatus, WorkspaceSnapshot} from '../../shared/types';
import {essayExcerpt} from '../../shared/utils/essay';

const statusText: Record<TaskStatus, string> = {
  todo: '待办',
  in_progress: '进行中',
  done: '完成',
};

export default function DashboardPage({
  snapshot,
  onNavigate,
}: {
  snapshot: WorkspaceSnapshot;
  onNavigate: (panel: PanelKey) => void;
}) {
  const activeProjects = snapshot.projects.filter((project) => !project.archivedAt);
  const activeTasks = snapshot.tasks.filter((task) => !task.archivedAt);
  const today = new Date().toISOString().slice(0, 10);
  const todayTasks = activeTasks.filter((task) => task.dueDate === today);
  const activeEssays = snapshot.essays.filter((essay) => !essay.archivedAt);
  const recentEssays = [...activeEssays]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 5);
  const doneTasks = activeTasks.filter((task) => task.status === 'done');

  return (
    <div className="dashboard-page">
      <section className="hero-band">
        <div>
          <span className="section-label">今日工作台</span>
          <h2>项目推进和随笔沉淀集中在这里</h2>
          <p>先处理今日任务，再把零散想法沉淀成可检索的随笔。</p>
        </div>
        <div className="hero-actions">
          <button className="primary-btn" type="button" onClick={() => onNavigate('tasks')}>
            新建任务
          </button>
          <button type="button" onClick={() => onNavigate('essays')}>
            写随笔
          </button>
        </div>
      </section>

      <section className="dashboard-summary">
        <SummaryItem label="活跃项目" value={activeProjects.length} onClick={() => onNavigate('tasks')} icon={<BriefcaseBusiness />} />
        <SummaryItem label="推进任务" value={activeTasks.length - doneTasks.length} onClick={() => onNavigate('tasks')} icon={<Clock3 />} />
        <SummaryItem label="已完成" value={doneTasks.length} onClick={() => onNavigate('tasks')} icon={<CheckCircle2 />} />
        <SummaryItem label="随笔沉淀" value={activeEssays.length} onClick={() => onNavigate('essays')} icon={<BookOpenText />} />
      </section>

      <section className="dashboard-grid">
        <section className="content-section">
          <div className="section-label">今日任务</div>
          <div className="list-panel">
            {todayTasks.length === 0 ? (
              <div className="list-row muted-row">今天没有到期任务</div>
            ) : (
              todayTasks.map((task) => (
                <button className="list-row clickable-row" key={task.id} type="button" onClick={() => onNavigate('tasks')}>
                  <span>{task.title}</span>
                  <small>{statusText[task.status]}</small>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="content-section">
          <div className="section-label">项目概览</div>
          <div className="list-panel project-overview">
            {activeProjects.map((project) => (
              <ProjectRow activeTasks={activeTasks.filter((task) => task.projectId === project.id).length} key={project.id} project={project} onNavigate={() => onNavigate('tasks')} />
            ))}
          </div>
        </section>
      </section>

      <section className="dashboard-grid">
        <section className="content-section">
          <div className="section-label">最近随笔</div>
          <div className="list-panel">
            {recentEssays.map((essay) => (
              <button className="list-row clickable-row" key={essay.id} type="button" onClick={() => onNavigate('essays')}>
                <span>{essayExcerpt(essay.content, essay.summary)}</span>
                <small>{essay.tags.length ? essay.tags.map((tag) => `#${tag}`).join(' ') : '快速记录'}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="content-section">
          <div className="section-label">快捷入口</div>
          <div className="quick-grid">
            <button type="button" onClick={() => onNavigate('tasks')}>
              <BriefcaseBusiness />
              <span>项目任务</span>
            </button>
            <button type="button" onClick={() => onNavigate('essays')}>
              <BookOpenText />
              <span>随笔</span>
            </button>
            <button type="button" onClick={() => onNavigate('tools')}>
              <Wrench />
              <span>工具箱</span>
            </button>
            <button type="button" onClick={() => onNavigate('assistant')}>
              <Bot />
              <span>AI 助手</span>
            </button>
          </div>
        </section>
      </section>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  icon,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="summary-item" type="button" onClick={onClick}>
      <span className="summary-icon">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}

function ProjectRow({project, activeTasks, onNavigate}: {project: Project; activeTasks: number; onNavigate: () => void}) {
  return (
    <button className="list-row clickable-row" type="button" onClick={onNavigate}>
      <span className="project-row-title">
        <i style={{'--item-color': project.color} as CSSProperties} />
        {project.name}
      </span>
      <small>{activeTasks} 个任务</small>
    </button>
  );
}
