import {useEffect, useMemo, useState} from 'react';
import type {ChangeEvent, ReactNode} from 'react';
import {
  Bot,
  CircleHelp,
  ExternalLink,
  FileQuestion,
  KeyRound,
  Link,
  MessageSquareText,
  Settings,
  UserRound,
  X,
} from 'lucide-react';
import type {Settings as AppSettings, UserProfile} from '../../shared/types';
import {commands} from '../../core/services/commands';

type SettingsTab = 'account' | 'system' | 'model' | 'shortcuts' | 'help';

const tabs: Array<{id: SettingsTab; label: string; icon: typeof UserRound}> = [
  {id: 'account', label: '账户管理', icon: UserRound},
  {id: 'system', label: '系统设置', icon: Settings},
  {id: 'model', label: '模型设置', icon: Bot},
  {id: 'shortcuts', label: '快捷键', icon: KeyRound},
  {id: 'help', label: '帮助与反馈', icon: CircleHelp},
];

const shortcutFields: Array<{key: keyof AppSettings; label: string; hint: string}> = [
  {key: 'sendMessageShortcut', label: '发送消息', hint: '模型对话输入框发送消息'},
  {key: 'globalSearchShortcut', label: '全局搜索', hint: '聚焦顶部搜索框'},
  {key: 'newTaskShortcut', label: '新增任务', hint: '预留任务创建入口'},
  {key: 'newEssayShortcut', label: '新增随笔', hint: '预留随笔创建入口'},
];

const normalizeSettings = (settings: AppSettings, workspacePath: string): AppSettings => ({
  ...settings,
  themeMode: settings.themeMode === 'dark' ? 'dark' : 'light',
  workspacePath: workspacePath || settings.workspacePath,
});

export default function SettingsDialog({
  profile,
  settings,
  workspacePath,
  initialTab = 'account',
  run,
  onThemePreview,
  onClose,
}: {
  profile: UserProfile;
  settings: AppSettings;
  workspacePath: string;
  initialTab?: SettingsTab;
  run: <T>(action: Promise<T>) => Promise<T>;
  onThemePreview: (themeMode: AppSettings['themeMode'] | null) => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [profileDraft, setProfileDraft] = useState(profile);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(() => normalizeSettings(settings, workspacePath));
  const [message, setMessage] = useState('');

  useEffect(() => setProfileDraft(profile), [profile]);
  useEffect(() => setSettingsDraft(normalizeSettings(settings, workspacePath)), [settings, workspacePath]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    document.documentElement.dataset.fontSize = settingsDraft.fontSize;
    return () => {
      document.documentElement.dataset.fontSize = settings.fontSize;
    };
  }, [settings.fontSize, settingsDraft.fontSize]);

  const phoneError = profileDraft.phone && !/^1\d{10}$/.test(profileDraft.phone);
  const emailError = profileDraft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileDraft.email);

  const updateSettingsDraft = (patch: Partial<AppSettings>) => {
    const next = {...settingsDraft, ...patch};
    setSettingsDraft(next);
    if (patch.themeMode) onThemePreview(patch.themeMode);
    if (patch.fontSize) document.documentElement.dataset.fontSize = patch.fontSize;
  };

  const save = async () => {
    if (phoneError || emailError) {
      setMessage('请检查手机号或邮箱格式');
      return;
    }
    await run(commands.updateProfile(profileDraft));
    await run(commands.updateSettings(settingsDraft));
    onThemePreview(null);
    setMessage('已保存设置');
  };

  const uploadAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfileDraft((current) => ({...current, avatarUrl: reader.result as string}));
      }
    };
    reader.readAsDataURL(file);
  };

  const helpItems = useMemo(
    () => [
      {label: '帮助文档', icon: FileQuestion},
      {label: '意见反馈', icon: MessageSquareText},
      {label: '联系我们', icon: Link},
    ],
    [],
  );

  return (
    <section className="settings-modal-backdrop" aria-label="设置弹窗" onMouseDown={onClose}>
      <section className="settings-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <aside className="settings-modal-rail" aria-label="设置分类">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`} key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}>
                <Icon />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </aside>

        <section className="settings-modal-content">
          <header className="settings-modal-header">
            <h2>{tabs.find((tab) => tab.id === activeTab)?.label}</h2>
            <button className="icon-btn" type="button" title="关闭" onClick={onClose}>
              <X />
            </button>
          </header>

          <section className="settings-modal-body">
            {activeTab === 'account' && (
              <SectionStack>
                <div className="profile-editor-head">
                  <AvatarImage avatarUrl={profileDraft.avatarUrl} nickname={profileDraft.nickname} />
                  <div>
                    <strong>{profileDraft.nickname || '本地用户'}</strong>
                    <span>本地免登录档案</span>
                  </div>
                </div>
                <div className="settings-card">
                  <SettingRow label="头像">
                    <label className="file-picker-btn">
                      上传头像
                      <input accept="image/*" type="file" onChange={uploadAvatar} />
                    </label>
                  </SettingRow>
                  <SettingRow label="昵称">
                    <input value={profileDraft.nickname} onChange={(event) => setProfileDraft({...profileDraft, nickname: event.target.value})} />
                  </SettingRow>
                  <SettingRow label="绑定手机号">
                    <input value={profileDraft.phone} onChange={(event) => setProfileDraft({...profileDraft, phone: event.target.value})} placeholder="手机号" />
                  </SettingRow>
                  <SettingRow label="绑定邮箱">
                    <input value={profileDraft.email} onChange={(event) => setProfileDraft({...profileDraft, email: event.target.value})} placeholder="邮箱" />
                  </SettingRow>
                  <SettingRow label="年龄">
                    <input value={profileDraft.age} onChange={(event) => setProfileDraft({...profileDraft, age: event.target.value})} placeholder="可选" />
                  </SettingRow>
                  <SettingRow label="性格">
                    <input value={profileDraft.personality} onChange={(event) => setProfileDraft({...profileDraft, personality: event.target.value})} placeholder="例如：稳重、外向" />
                  </SettingRow>
                  <SettingRow label="性别">
                    <select value={profileDraft.gender} onChange={(event) => setProfileDraft({...profileDraft, gender: event.target.value})}>
                      <option value="">未设置</option>
                      <option value="male">男</option>
                      <option value="female">女</option>
                      <option value="other">其他</option>
                    </select>
                  </SettingRow>
                  {(phoneError || emailError) && <div className="settings-hint">请检查手机号或邮箱格式</div>}
                </div>
              </SectionStack>
            )}

            {activeTab === 'system' && (
              <SectionStack>
                <div className="settings-card">
                  <SettingRow label="显示语言" description="设置应用程序界面显示语言。">
                    <select value={settingsDraft.language} onChange={(event) => updateSettingsDraft({language: event.target.value as AppSettings['language']})}>
                      <option value="zh-CN">中文(简体)</option>
                      <option value="en-US">English</option>
                    </select>
                  </SettingRow>
                  <SettingRow label="字体大小">
                    <div className="segmented">
                      {(['small', 'default', 'large'] as const).map((value) => (
                        <button className={settingsDraft.fontSize === value ? 'active' : ''} key={value} type="button" onClick={() => updateSettingsDraft({fontSize: value})}>
                          {value === 'small' ? '小' : value === 'default' ? '默认' : '大'}
                        </button>
                      ))}
                    </div>
                  </SettingRow>
                  <SettingRow label="主题方式">
                    <div className="segmented">
                      {(['light', 'dark'] as const).map((value) => (
                        <button className={settingsDraft.themeMode === value ? 'active' : ''} key={value} type="button" onClick={() => updateSettingsDraft({themeMode: value})}>
                          {value === 'light' ? '浅色' : '深色'}
                        </button>
                      ))}
                    </div>
                  </SettingRow>
                  <SettingRow label="默认工作空间存储路径" description="当前本地工作台数据保存位置。">
                    <input readOnly value={settingsDraft.workspacePath || workspacePath || 'localStorage: fastnote:v2'} />
                  </SettingRow>
                </div>
              </SectionStack>
            )}

            {activeTab === 'model' && (
              <SectionStack>
                <div className="settings-card">
                  <SettingRow label="AI Provider">
                    <select value={settingsDraft.aiProvider} onChange={(event) => updateSettingsDraft({aiProvider: event.target.value as AppSettings['aiProvider']})}>
                      <option value="mock">本地模式</option>
                      <option value="openai-compatible">OpenAI-compatible</option>
                    </select>
                  </SettingRow>
                  <SettingRow label="Base URL">
                    <input value={settingsDraft.aiBaseUrl} onChange={(event) => updateSettingsDraft({aiBaseUrl: event.target.value})} />
                  </SettingRow>
                  <SettingRow label="AppKey / API Key">
                    <input type="password" value={settingsDraft.aiApiKey} onChange={(event) => updateSettingsDraft({aiApiKey: event.target.value})} />
                  </SettingRow>
                  <SettingRow label="模型">
                    <input value={settingsDraft.aiModel} onChange={(event) => updateSettingsDraft({aiModel: event.target.value})} />
                  </SettingRow>
                </div>
              </SectionStack>
            )}

            {activeTab === 'shortcuts' && (
              <SectionStack>
                <div className="settings-card">
                  {shortcutFields.map((item) => (
                    <SettingRow description={item.hint} key={item.key} label={item.label}>
                      <input value={String(settingsDraft[item.key])} onChange={(event) => updateSettingsDraft({[item.key]: event.target.value} as Partial<AppSettings>)} />
                    </SettingRow>
                  ))}
                </div>
              </SectionStack>
            )}

            {activeTab === 'help' && (
              <SectionStack>
                <div className="settings-card">
                  {helpItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <SettingRow description={item.label === '帮助文档' ? '查看 FastNote 的使用说明和常见问题。' : item.label === '意见反馈' ? '提交问题、建议或体验反馈。' : '获取支持和联系信息。'} key={item.label} label={item.label}>
                        <button className="help-action-btn" type="button" onClick={() => setMessage(`${item.label} 功能将在后续版本接入。`)}>
                          <Icon />
                          打开
                          <ExternalLink />
                        </button>
                      </SettingRow>
                    );
                  })}
                </div>
              </SectionStack>
            )}
          </section>

          <footer className="settings-modal-footer">
            <span>{message || '本地免登录模式，设置会保存到当前设备。'}</span>
            <button className="dark-btn" type="button" onClick={save}>
              保存
            </button>
          </footer>
        </section>
      </section>
    </section>
  );
}

export function AvatarImage({avatarUrl, nickname}: {avatarUrl: string; nickname: string}) {
  return avatarUrl ? (
    <img className="avatar-image" src={avatarUrl} alt={nickname || '头像'} />
  ) : (
    <span className="avatar-fallback">
      <UserRound />
    </span>
  );
}

function SectionStack({children}: {children: ReactNode}) {
  return <div className="settings-section-stack">{children}</div>;
}

function SettingRow({label, description, children}: {label: string; description?: string; children: ReactNode}) {
  return (
    <div className="setting-row settings-dialog-row">
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      {children}
    </div>
  );
}
