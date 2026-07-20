import {invoke} from '@tauri-apps/api/core';
import type {
  Essay,
  EssayAttachment,
  EssayCategory,
  EssayMutation,
  Project,
  Settings,
  Task,
  TaskPlacement,
  TaskStatus,
  UserProfile,
  WorkspaceSnapshot,
} from '../../shared/types';
import {localDb} from './localDb';

const ESSAY_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export const isTauriRuntime = () => Boolean('__TAURI_INTERNALS__' in window);

async function call<T>(command: string, args: Record<string, unknown>, fallback: () => Promise<T>) {
  if (isTauriRuntime()) {
    return invoke<T>(command, args);
  }
  return fallback();
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(dataUrl: string) {
  return new Promise<{width: number; height: number}>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({width: image.naturalWidth, height: image.naturalHeight});
    image.onerror = () => reject(new Error('无法解析图片尺寸'));
    image.src = dataUrl;
  });
}

export const commands = {
  getSnapshot: () => call<WorkspaceSnapshot>('workspace_snapshot', {}, localDb.getSnapshot),
  getWorkspacePath: () => call<string>('workspace_path', {}, localDb.getWorkspacePath),
  updateProfile: (profile: Partial<UserProfile>) =>
    call<UserProfile>('profile_update', {profile}, () => localDb.updateProfile(profile)),
  createProject: (project: Partial<Project>) =>
    call<Project>('project_create', {project}, () => localDb.createProject(project)),
  updateProject: (project: Partial<Project> & {id: string}) =>
    call<Project>('project_update', {project}, () => localDb.updateProject(project)),
  archiveProject: (id: string) => call<Project>('project_archive', {id}, () => localDb.archiveProject(id)),
  restoreProject: (id: string) => call<Project>('project_restore', {id}, () => localDb.restoreProject(id)),
  createTask: (task: Partial<Task>) => call<Task>('task_create', {task}, () => localDb.createTask(task)),
  updateTask: (task: Partial<Task> & {id: string}) =>
    call<Task>('task_update', {task}, () => localDb.updateTask(task)),
  archiveTask: (id: string) => call<Task>('task_archive', {id}, () => localDb.archiveTask(id)),
  restoreTask: (id: string) => call<Task>('task_restore', {id}, () => localDb.restoreTask(id)),
  moveTask: (id: string, status: TaskStatus) =>
    call<Task>('task_move', {id, status}, () => localDb.moveTask(id, status)),
  reorderTasks: (placements: TaskPlacement[]) =>
    call<void>('tasks_reorder', {placements}, () => localDb.reorderTasks(placements)),
  createEssayCategory: (category: Partial<EssayCategory>) =>
    call<EssayCategory>('essay_category_create', {category}, () => localDb.createEssayCategory(category)),
  updateEssayCategory: (category: Partial<EssayCategory> & {id: string}) =>
    call<EssayCategory>('essay_category_update', {category}, () => localDb.updateEssayCategory(category)),
  archiveEssayCategory: (id: string) =>
    call<EssayCategory>('essay_category_archive', {id}, () => localDb.archiveEssayCategory(id)),
  importEssayAttachment: async (file: File) => {
    if (!ESSAY_IMAGE_TYPES.has(file.type)) throw new Error('仅支持 JPG、PNG、GIF 和 WebP 图片');
    if (file.size > 10 * 1024 * 1024) throw new Error('单张图片不能超过 10 MB');
    const previewDataUrl = await readFileAsDataUrl(file);
    const {width, height} = await readImageDimensions(previewDataUrl);
    const dataBase64 = previewDataUrl.slice(previewDataUrl.indexOf(',') + 1);
    return call<EssayAttachment>(
      'essay_attachment_import',
      {fileName: file.name || `screenshot-${Date.now()}.png`, mimeType: file.type, dataBase64},
      () => localDb.importEssayAttachment({
        fileName: file.name || `screenshot-${Date.now()}.png`,
        mimeType: file.type,
        sizeBytes: file.size,
        width,
        height,
        previewDataUrl,
      }),
    );
  },
  createEssay: (essay: EssayMutation) => call<Essay>('essay_create', {essay}, () => localDb.createEssay(essay)),
  updateEssay: (essay: EssayMutation & {id: string}) =>
    call<Essay>('essay_update', {essay}, () => localDb.updateEssay(essay)),
  archiveEssay: (id: string) => call<Essay>('essay_archive', {id}, () => localDb.archiveEssay(id)),
  restoreEssay: (id: string) => call<Essay>('essay_restore', {id}, () => localDb.restoreEssay(id)),
  updateSettings: (settings: Partial<Settings>) =>
    call<Settings>('settings_update', {settings}, () => localDb.updateSettings(settings)),
  sendMessage: (content: string, conversationId?: string) =>
    call('chat_send', {content, conversationId}, () => localDb.sendMessage(content, conversationId)),
};
