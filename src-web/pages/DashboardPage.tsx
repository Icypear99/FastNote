import {Bot, CheckSquare, FileText, Wrench} from 'lucide-react';
import type {PanelKey, TaskStatus, WorkspaceSnapshot} from '../types';

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
  const activeTasks = snapshot.tasks.filter((task) => !task.archivedAt);
  const today = new Date().toISOString().slice(0, 10);
  const todayTasks = activeTasks.filter((task) => task.dueDate === today);
  const recentNotes = snapshot.notes.filter((note) => !note.archivedAt).slice(0, 4);

  return (
    <div className="page-stack">
      <section className="dashboard-summary">
        <SummaryItem label="活跃任务" value={activeTasks.length} onClick={() => onNavigate('tasks')} icon={<CheckSquare />} />
        <SummaryItem label="今日到期" value={todayTasks.length} onClick={() => onNavigate('tasks')} icon={<CheckSquare />} />
        <SummaryItem label="笔记" value={recentNotes.length} onClick={() => onNavigate('notes')} icon={<FileText />} />
        <SummaryItem label="对话" value={snapshot.conversations.length} onClick={() => onNavigate('assistant')} icon={<Bot />} />
      </section>

      <section className="content-section">
        <div className="section-label">今日</div>
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
        <div className="section-label">最近笔记</div>
        <div className="list-panel">
          {recentNotes.map((note) => (
            <button className="list-row clickable-row" key={note.id} type="button" onClick={() => onNavigate('notes')}>
              <span>{note.title}</span>
              <small>{note.summary || '未填写摘要'}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="content-section">
        <div className="section-label">快捷入口</div>
        <div className="quick-grid">
          <button type="button" onClick={() => onNavigate('tools')}>
            <Wrench />
            <span>工具箱</span>
          </button>
          <button type="button" onClick={() => onNavigate('assistant')}>
            <Bot />
            <span>助手</span>
          </button>
          <button type="button" onClick={() => onNavigate('settings')}>
            <FileText />
            <span>资料设置</span>
          </button>
        </div>
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
