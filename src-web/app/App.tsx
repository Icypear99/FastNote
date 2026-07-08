import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {
  Bot,
  BookOpenText,
  BriefcaseBusiness,
  CalendarDays,
  Home,
  Maximize2,
  Minus,
  Settings,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import DashboardPage from '../features/dashboard/DashboardPage';
import TasksPage from '../features/tasks/TasksPage';
import EssaysPage from '../features/essays/EssaysPage';
import ToolsPage from '../features/tools/ToolsPage';
import AssistantPage from '../features/assistant/AssistantPage';
import SettingsPage from '../features/settings/SettingsPage';
import {commands, isTauriRuntime} from '../core/services/commands';
import {useUiStore} from './stores/uiStore';
import type {PanelKey, ThemeMode, WorkspaceSnapshot} from '../shared/types';

const panelMeta: Record<PanelKey, {title: string; icon: typeof Home}> = {
  dashboard: {title: '工作台', icon: Home},
  tasks: {title: '项目任务', icon: BriefcaseBusiness},
  essays: {title: '随笔', icon: BookOpenText},
  tools: {title: '工具', icon: Wrench},
  assistant: {title: '助手', icon: Bot},
  settings: {title: '设置', icon: Settings},
};

const navItems: PanelKey[] = ['dashboard', 'tasks', 'essays', 'tools', 'assistant'];
const themeModes: ThemeMode[] = ['light', 'dark', 'deep-blue', 'transparent', 'system'];

function resolveTheme(themeMode: ThemeMode, prefersDark: boolean) {
  return themeMode === 'system' ? (prefersDark ? 'dark' : 'light') : themeMode;
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export default function App() {
  const {activePanel, setActivePanel} = useUiStore();
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [themePreview, setThemePreview] = useState<ThemeMode | null>(null);
  const [prefersDark, setPrefersDark] = useState(false);
  const [error, setError] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(232);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(60);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await commands.getSnapshot());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const run = useCallback(
    async <T,>(action: Promise<T>) => {
      const result = await action;
      await refresh();
      return result;
    },
    [refresh],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const applyWindowIcon = async () => {
      try {
        const response = await fetch('/logo.webp');
        const iconBytes = new Uint8Array(await response.arrayBuffer());
        await getCurrentWindow().setIcon(iconBytes);
      } catch (err) {
        console.warn('Failed to apply FastNote window icon', err);
      }
    };
    void applyWindowIcon();
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const update = () => setPrefersDark(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const themeMode = themePreview ?? snapshot?.settings.themeMode ?? 'light';
    const safeTheme = themeModes.includes(themeMode) ? themeMode : 'light';
    const resolvedTheme = resolveTheme(safeTheme, prefersDark);
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themeMode = safeTheme;
  }, [prefersDark, snapshot?.settings.themeMode, themePreview]);

  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!isDragging.current) return;
      const nextWidth = Math.min(280, Math.max(72, dragStartWidth.current + event.clientX - dragStartX.current));
      setSidebarWidth(nextWidth);
    };
    const up = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
  }, []);

  const isCollapsed = sidebarWidth <= 96;
  const currentTitle = panelMeta[activePanel].title;
  const panel = useMemo(() => {
    if (!snapshot) return null;
    if (activePanel === 'dashboard') return <DashboardPage snapshot={snapshot} onNavigate={setActivePanel} />;
    if (activePanel === 'tasks') return <TasksPage projects={snapshot.projects} tasks={snapshot.tasks} run={run} />;
    if (activePanel === 'essays') {
      return <EssaysPage essays={snapshot.essays} categories={snapshot.essayCategories} run={run} />;
    }
    if (activePanel === 'tools') return <ToolsPage />;
    if (activePanel === 'assistant') {
      return (
        <AssistantPage
          conversations={snapshot.conversations}
          messages={snapshot.messages}
          settings={snapshot.settings}
          run={run}
        />
      );
    }
    return <SettingsPage profile={snapshot.profile} settings={snapshot.settings} run={run} onThemePreview={setThemePreview} />;
  }, [activePanel, run, setActivePanel, snapshot]);

  const handleResizeMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    isDragging.current = true;
    dragStartX.current = event.clientX;
    dragStartWidth.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const minimize = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!isTauriRuntime()) return;
    await getCurrentWindow().minimize();
  };

  const maximize = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!isTauriRuntime()) return;
    await getCurrentWindow().toggleMaximize();
  };

  const close = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!isTauriRuntime()) return;
    await getCurrentWindow().close();
  };

  return (
    <div className="app-container">
      <aside
        ref={sidebarRef}
        className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}
        style={{width: sidebarWidth, minWidth: sidebarWidth}}
        data-tauri-drag-region
      >
        <div className="sidebar-header" data-tauri-drag-region>
          <img className="sidebar-logo" src="/logo.webp" alt="FastNote" />
          <span className="sidebar-brand">FastNote</span>
        </div>

        <nav className="sidebar-nav" aria-label="主导航">
          {navItems.map((item) => (
            <SidebarButton key={item} panel={item} activePanel={activePanel} onClick={setActivePanel} />
          ))}
        </nav>

        <div className="sidebar-footer">
          <SidebarButton panel="settings" activePanel={activePanel} onClick={setActivePanel} isFooter />
        </div>

        <div className="sidebar-resize-handle" onMouseDown={handleResizeMouseDown} />
      </aside>

      <main className="panel-area">
        <header className="panel-window-header">
          <div className="topbar-heading" data-tauri-drag-region>
            <span className="topbar-kicker">FastNote</span>
            <h1 className="panel-window-title">{currentTitle}</h1>
          </div>
          <label className="global-search" aria-label="全局搜索">
            <span>搜索</span>
            <input placeholder="任务、项目、随笔" />
          </label>
          <div className="panel-window-drag-fill" data-tauri-drag-region />
          <TopbarClock />
          <div className="window-controls">
            <button className="window-minimize-btn" type="button" title="最小化" onClick={minimize}>
              <Minus />
            </button>
            <button className="window-maximize-btn" type="button" title="最大化" onClick={maximize}>
              <Maximize2 />
            </button>
            <button className="window-close-btn" type="button" title="关闭" onClick={close}>
              <X />
            </button>
          </div>
        </header>
        <section className="panel-window-body">
          {error ? (
            <div className="empty-state">
              <strong>页面加载失败</strong>
              <span>{error}</span>
              <button type="button" className="primary-btn" onClick={refresh}>
                重新加载
              </button>
            </div>
          ) : (
            panel ?? <div className="page-loading">正在载入本地数据...</div>
          )}
        </section>
      </main>
    </div>
  );
}

function TopbarClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="topbar-clock" aria-label="当前日期时间">
      <CalendarDays />
      <span>{formatDateTime(now)}</span>
    </div>
  );
}

function SidebarButton({
  panel,
  activePanel,
  onClick,
  isFooter = false,
}: {
  panel: PanelKey;
  activePanel: PanelKey;
  onClick: (panel: PanelKey) => void;
  isFooter?: boolean;
}) {
  const meta = panelMeta[panel];
  const Icon = panel === 'settings' ? UserRound : meta.icon;
  const className = `${isFooter ? 'sidebar-footer-item' : 'sidebar-nav-item'} ${activePanel === panel ? 'active' : ''}`;
  return (
    <button className={className} type="button" title={meta.title} onClick={() => onClick(panel)}>
      <span className={isFooter ? 'sidebar-footer-icon' : 'sidebar-nav-icon'}>
        <Icon />
      </span>
      <span className={isFooter ? 'sidebar-footer-label' : 'sidebar-nav-label'}>{meta.title}</span>
    </button>
  );
}
