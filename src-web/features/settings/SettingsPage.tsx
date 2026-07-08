import {useEffect, useState} from 'react';
import type {Settings, UserProfile} from '../../shared/types';
import {commands} from '../../core/services/commands';

export default function SettingsPage({
  profile,
  settings,
  run,
  onThemePreview,
}: {
  profile: UserProfile;
  settings: Settings;
  run: <T>(action: Promise<T>) => Promise<T>;
  onThemePreview: (themeMode: Settings['themeMode'] | null) => void;
}) {
  const [profileDraft, setProfileDraft] = useState(profile);
  const [settingsDraft, setSettingsDraft] = useState(settings);

  useEffect(() => setProfileDraft(profile), [profile]);
  useEffect(() => setSettingsDraft(settings), [settings]);
  useEffect(() => () => onThemePreview(null), [onThemePreview]);

  const phoneError = profileDraft.phone && !/^1\d{10}$/.test(profileDraft.phone);
  const emailError = profileDraft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileDraft.email);

  const save = async () => {
    if (phoneError || emailError) return;
    await run(commands.updateProfile(profileDraft));
    await run(commands.updateSettings(settingsDraft));
    onThemePreview(null);
  };

  const changeTheme = async (themeMode: Settings['themeMode']) => {
    const nextSettings = {...settingsDraft, themeMode};
    setSettingsDraft(nextSettings);
    onThemePreview(themeMode);
    await run(commands.updateSettings({themeMode}));
    onThemePreview(null);
  };

  return (
    <div className="settings-page">
      <section className="content-section">
        <div className="section-label">个人信息</div>
        <div className="settings-card">
          <SettingRow label="昵称">
            <input value={profileDraft.nickname} onChange={(event) => setProfileDraft({...profileDraft, nickname: event.target.value})} />
          </SettingRow>
          <SettingRow label="头像">
            <input value={profileDraft.avatarUrl} onChange={(event) => setProfileDraft({...profileDraft, avatarUrl: event.target.value})} placeholder="图片 URL 或 data URL" />
          </SettingRow>
          <SettingRow label="手机号">
            <input value={profileDraft.phone} onChange={(event) => setProfileDraft({...profileDraft, phone: event.target.value})} />
          </SettingRow>
          <SettingRow label="邮箱">
            <input value={profileDraft.email} onChange={(event) => setProfileDraft({...profileDraft, email: event.target.value})} />
          </SettingRow>
          {(phoneError || emailError) && <div className="settings-hint">请检查手机号或邮箱格式</div>}
        </div>
      </section>

      <section className="content-section">
        <div className="section-label">基础设置</div>
        <div className="settings-card">
          <SettingRow label="主题">
            <select value={settingsDraft.themeMode} onChange={(event) => void changeTheme(event.target.value as Settings['themeMode'])}>
              <option value="light">浅色</option>
              <option value="dark">暗色</option>
              <option value="deep-blue">深蓝</option>
              <option value="transparent">透明</option>
              <option value="system">跟随系统</option>
            </select>
          </SettingRow>
          <SettingRow label="AI Provider">
            <select value={settingsDraft.aiProvider} onChange={(event) => setSettingsDraft({...settingsDraft, aiProvider: event.target.value as Settings['aiProvider']})}>
              <option value="mock">本地模式</option>
              <option value="openai-compatible">OpenAI-compatible</option>
            </select>
          </SettingRow>
          <SettingRow label="模型">
            <input value={settingsDraft.aiModel} onChange={(event) => setSettingsDraft({...settingsDraft, aiModel: event.target.value})} />
          </SettingRow>
          <SettingRow label="API Key">
            <input
              type="password"
              value={settingsDraft.aiApiKey}
              onChange={(event) => setSettingsDraft({...settingsDraft, aiApiKey: event.target.value})}
            />
          </SettingRow>
        </div>
      </section>

      <div className="settings-actions">
        <span>
          账号方式：本地免登录；手机号、邮箱、第三方登录已保留扩展位。
        </span>
        <button className="dark-btn" type="button" onClick={save}>
          保存
        </button>
      </div>
    </div>
  );
}

function SettingRow({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <label className="setting-row">
      <span>{label}</span>
      {children}
    </label>
  );
}
