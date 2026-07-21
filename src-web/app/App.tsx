import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {
  Bot,
  BookOpenText,
  BriefcaseBusiness,
  CalendarDays,
  CircleHelp,
  Home,
  LogOut,
  Maximize2,
  Minus,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Settings,
  Wrench,
  X,
} from 'lucide-react';
import DashboardPage from '../features/dashboard/DashboardPage';
import TasksPage from '../features/tasks/TasksPage';
import EssaysPage from '../features/essays/EssaysPage';
import ToolsPage from '../features/tools/ToolsPage';
import AssistantPage from '../features/assistant/AssistantPage';
import SettingsDialog, {AvatarImage} from '../features/settings/SettingsPage';
import {commands, isTauriRuntime} from '../core/services/commands';
import {useUiStore} from './stores/uiStore';
import type {PanelKey, ThemeMode, WorkspaceSnapshot} from '../shared/types';
import {useAppFeedback} from '../shared/components/feedback';

const panelMeta: Record<PanelKey, {title: string; icon: typeof Home}> = {
  dashboard: {title: '工作台', icon: Home},
  tasks: {title: '项目任务', icon: BriefcaseBusiness},
  essays: {title: '随笔', icon: BookOpenText},
  tools: {title: '工具', icon: Wrench},
  assistant: {title: '助手', icon: Bot},
};

const navItems: PanelKey[] = ['dashboard', 'tasks', 'essays', 'tools', 'assistant'];
const SIDEBAR_EXPANDED_WIDTH = 232;
const SIDEBAR_COLLAPSED_WIDTH = 62;

function normalizeTheme(themeMode: ThemeMode | null | undefined): 'light' | 'dark' {
  return themeMode === 'dark' ? 'dark' : 'light';
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
  const feedback = useAppFeedback();
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [themePreview, setThemePreview] = useState<ThemeMode | null>(null);
  const [error, setError] = useState('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'account' | 'system' | 'model' | 'shortcuts' | 'help'>('account');
  const [workspacePath, setWorkspacePath] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const globalSearchRef = useRef<HTMLInputElement>(null);
  const profileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const profileMenuRef = useRef<HTMLElement>(null);

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
    commands
      .getWorkspacePath()
      .then(setWorkspacePath)
      .catch(() => setWorkspacePath('localStorage: fastnote:v2'));
  }, []);

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
    const themeMode = themePreview ?? snapshot?.settings.themeMode ?? 'light';
    const resolvedTheme = normalizeTheme(themeMode);
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themeMode = resolvedTheme;
  }, [snapshot?.settings.themeMode, themePreview]);

  useEffect(() => {
    document.documentElement.dataset.fontSize = snapshot?.settings.fontSize ?? 'default';
  }, [snapshot?.settings.fontSize]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (matchesShortcut(event, snapshot?.settings.globalSearchShortcut ?? 'Ctrl+K')) {
        event.preventDefault();
        if (activePanel === 'essays') {
          document.querySelector<HTMLInputElement>('[data-essay-search]')?.focus();
        } else {
          globalSearchRef.current?.focus();
        }
      }
      if (event.key === 'Escape') {
        setIsProfileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activePanel, snapshot?.settings.globalSearchShortcut]);

  useEffect(() => {
    if (!isProfileMenuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (profileMenuTriggerRef.current?.contains(target) || profileMenuRef.current?.contains(target)) return;
      setIsProfileMenuOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isProfileMenuOpen]);

  const sidebarWidth = isSidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;
  const currentTitle = panelMeta[activePanel].title;
  const panel = useMemo(() => {
    if (!snapshot) return null;
    if (activePanel === 'dashboard') return <DashboardPage snapshot={snapshot} onNavigate={setActivePanel} />;
    if (activePanel === 'tasks') return <TasksPage projects={snapshot.projects} tasks={snapshot.tasks} run={run} />;
    if (activePanel === 'essays') {
      return (
        <EssaysPage
          essays={snapshot.essays}
          searchQuery={globalSearch}
          onSearchChange={setGlobalSearch}
          onClearSearch={() => setGlobalSearch('')}
          run={run}
        />
      );
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
    return <DashboardPage snapshot={snapshot} onNavigate={setActivePanel} />;
  }, [activePanel, globalSearch, run, setActivePanel, snapshot]);

  const updateTheme = async (themeMode: 'light' | 'dark') => {
    setThemePreview(themeMode);
    await run(commands.updateSettings({themeMode}));
    setThemePreview(null);
  };

  const showLocalLogoutMessage = () => {
    setIsProfileMenuOpen(false);
    feedback.info('当前是本地免登录模式，无需退出登录。', 'local-login-mode');
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
        className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}
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
          {snapshot && (
            <button
              ref={profileMenuTriggerRef}
              className="sidebar-footer-item profile-entry"
              type="button"
              title={snapshot.profile.nickname || '本地用户'}
              aria-label={snapshot.profile.nickname || '本地用户'}
              onClick={() => setIsProfileMenuOpen((value) => !value)}
            >
              <span className="sidebar-footer-icon profile-entry-icon">
                <AvatarImage avatarUrl={snapshot.profile.avatarUrl} nickname={snapshot.profile.nickname} />
              </span>
              <span className="sidebar-footer-label">{snapshot.profile.nickname || '本地用户'}</span>
            </button>
          )}
          {snapshot && isProfileMenuOpen && (
            <section ref={profileMenuRef} className="profile-popover" aria-label="个人菜单">
              <header className="profile-popover-head">
                <AvatarImage avatarUrl={snapshot.profile.avatarUrl} nickname={snapshot.profile.nickname} />
                <div>
                  <strong>{snapshot.profile.nickname || '本地用户'}</strong>
                  <span>本地免登录</span>
                </div>
              </header>
              <button type="button" onClick={() => { setSettingsInitialTab('account'); setIsSettingsOpen(true); setIsProfileMenuOpen(false); }}>
                <Settings />
                <span>设置</span>
              </button>
              <div className="profile-popover-theme">
                <span>
                  <Palette />
                  外观
                </span>
                <div className="segmented">
                  <button className={normalizeTheme(snapshot.settings.themeMode) === 'light' ? 'active' : ''} type="button" onClick={() => void updateTheme('light')}>
                    浅色
                  </button>
                  <button className={normalizeTheme(snapshot.settings.themeMode) === 'dark' ? 'active' : ''} type="button" onClick={() => void updateTheme('dark')}>
                    深色
                  </button>
                </div>
              </div>
              <button type="button" onClick={() => { setSettingsInitialTab('help'); setIsSettingsOpen(true); setIsProfileMenuOpen(false); }}>
                <CircleHelp />
                <span>帮助与反馈</span>
              </button>
              <button type="button" onClick={() => feedback.info('当前已经是最新版本。', 'app-update-status')}>
                <RefreshCw />
                <span>检查更新</span>
              </button>
              <button className="profile-popover-logout" type="button" onClick={showLocalLogoutMessage}>
                <LogOut />
                <span>退出登录</span>
              </button>
            </section>
          )}
          <button
            className="sidebar-footer-item sidebar-toggle-item"
            type="button"
            title={isSidebarCollapsed ? '展开导航栏' : '收缩导航栏'}
            aria-label={isSidebarCollapsed ? '展开导航栏' : '收缩导航栏'}
            onClick={() => setIsSidebarCollapsed((value) => !value)}
          >
            <span className="sidebar-footer-icon">{isSidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</span>
            <span className="sidebar-footer-label">{isSidebarCollapsed ? '展开' : '收缩'}</span>
          </button>
        </div>
      </aside>

      <main className="panel-area">
        <header className="panel-window-header">
          <div className="topbar-heading" data-tauri-drag-region>
            <span className="topbar-kicker">FastNote</span>
            <h1 className="panel-window-title">{currentTitle}</h1>
          </div>
          {activePanel !== 'essays' && (
            <label className="global-search" aria-label="全局搜索">
              <Search aria-hidden="true" />
              <input
                ref={globalSearchRef}
                value={globalSearch}
                placeholder="任务、项目、随笔"
                onChange={(event) => setGlobalSearch(event.currentTarget.value)}
              />
            </label>
          )}
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
      {snapshot && isSettingsOpen && (
        <SettingsDialog
          profile={snapshot.profile}
          settings={{...snapshot.settings, workspacePath: workspacePath || snapshot.settings.workspacePath}}
          workspacePath={workspacePath}
          initialTab={settingsInitialTab}
          run={run}
          onThemePreview={setThemePreview}
          onSaveSuccess={({title, message}) => {
            feedback.success(`${title}：${message}`, 'settings-save-success');
          }}
          onClose={() => {
            setThemePreview(null);
            setIsSettingsOpen(false);
          }}
        />
      )}
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
}: {
  panel: PanelKey;
  activePanel: PanelKey;
  onClick: (panel: PanelKey) => void;
}) {
  const meta = panelMeta[panel];
  const Icon = meta.icon;
  const className = `sidebar-nav-item ${activePanel === panel ? 'active' : ''}`;
  return (
    <button className={className} type="button" title={meta.title} onClick={() => onClick(panel)}>
      <span className="sidebar-nav-icon">
        <Icon />
      </span>
      <span className="sidebar-nav-label">{meta.title}</span>
    </button>
  );
}

function matchesShortcut(event: KeyboardEvent, shortcut: string) {
  const parts = shortcut
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  const key = parts.find((part) => !['ctrl', 'control', 'shift', 'alt', 'meta', 'cmd'].includes(part));
  const wantsCtrl = parts.includes('ctrl') || parts.includes('control');
  const wantsShift = parts.includes('shift');
  const wantsAlt = parts.includes('alt');
  const wantsMeta = parts.includes('meta') || parts.includes('cmd');
  return (
    Boolean(key) &&
    event.key.toLowerCase() === key &&
    event.ctrlKey === wantsCtrl &&
    event.shiftKey === wantsShift &&
    event.altKey === wantsAlt &&
    event.metaKey === wantsMeta
  );
}
