import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {
  Bot,
  BriefcaseBusiness,
  CheckSquare,
  FileText,
  Home,
  Minus,
  Settings,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import DashboardPage from './pages/DashboardPage';
import TasksPage from './pages/TasksPage';
import NotesPage from './pages/NotesPage';
import ToolsPage from './pages/ToolsPage';
import AssistantPage from './pages/AssistantPage';
import SettingsPage from './pages/SettingsPage';
import {commands, isTauriRuntime} from './services/commands';
import {useUiStore} from './stores/uiStore';
import type {PanelKey, ThemeMode, WorkspaceSnapshot} from './types';

const panelMeta: Record<PanelKey, {title: string; icon: typeof Home}> = {
  dashboard: {title: '工作台', icon: Home},
  tasks: {title: '待办', icon: CheckSquare},
  notes: {title: '笔记', icon: FileText},
  tools: {title: '工具', icon: Wrench},
  assistant: {title: '助手', icon: Bot},
  settings: {title: '设置', icon: Settings},
};

const navItems: PanelKey[] = ['dashboard', 'tasks', 'notes', 'tools', 'assistant'];
const themeModes: ThemeMode[] = ['light', 'dark', 'deep-blue', 'transparent', 'system'];

function resolveTheme(themeMode: ThemeMode, prefersDark: boolean) {
  return themeMode === 'system' ? (prefersDark ? 'dark' : 'light') : themeMode;
}

export default function App() {
  const {activePanel, setActivePanel} = useUiStore();
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [themePreview, setThemePreview] = useState<ThemeMode | null>(null);
  const [prefersDark, setPrefersDark] = useState(false);
  const [error, setError] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(60);
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
      const nextWidth = Math.min(128, Math.max(60, dragStartWidth.current + event.clientX - dragStartX.current));
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

  const isCollapsed = sidebarWidth <= 82;
  const currentTitle = panelMeta[activePanel].title;
  const panel = useMemo(() => {
    if (!snapshot) return null;
    if (activePanel === 'dashboard') return <DashboardPage snapshot={snapshot} onNavigate={setActivePanel} />;
    if (activePanel === 'tasks') return <TasksPage tasks={snapshot.tasks} run={run} />;
    if (activePanel === 'notes') return <NotesPage notes={snapshot.notes} run={run} />;
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
          <h1 className="panel-window-title" data-tauri-drag-region>
            {currentTitle}
          </h1>
          <div className="panel-window-drag-fill" data-tauri-drag-region />
          <div className="window-controls">
            <button className="window-minimize-btn" type="button" title="最小化" onClick={minimize}>
              <Minus />
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
