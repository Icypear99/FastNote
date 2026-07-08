import {invoke} from '@tauri-apps/api/core';
import type {Essay, EssayCategory, Project, Settings, Task, TaskStatus, UserProfile, WorkspaceSnapshot} from '../../shared/types';
import {localDb} from './localDb';

export const isTauriRuntime = () => Boolean('__TAURI_INTERNALS__' in window);

async function call<T>(command: string, args: Record<string, unknown>, fallback: () => Promise<T>) {
  if (isTauriRuntime()) {
    return invoke<T>(command, args);
  }
  return fallback();
}

export const commands = {
  getSnapshot: () => call<WorkspaceSnapshot>('workspace_snapshot', {}, localDb.getSnapshot),
  updateProfile: (profile: Partial<UserProfile>) =>
    call<UserProfile>('profile_update', {profile}, () => localDb.updateProfile(profile)),
  createProject: (project: Partial<Project>) =>
    call<Project>('project_create', {project}, () => localDb.createProject(project)),
  updateProject: (project: Partial<Project> & {id: string}) =>
    call<Project>('project_update', {project}, () => localDb.updateProject(project)),
  archiveProject: (id: string) => call<Project>('project_archive', {id}, () => localDb.archiveProject(id)),
  createTask: (task: Partial<Task>) => call<Task>('task_create', {task}, () => localDb.createTask(task)),
  updateTask: (task: Partial<Task> & {id: string}) =>
    call<Task>('task_update', {task}, () => localDb.updateTask(task)),
  archiveTask: (id: string) => call<Task>('task_archive', {id}, () => localDb.archiveTask(id)),
  moveTask: (id: string, status: TaskStatus) =>
    call<Task>('task_move', {id, status}, () => localDb.moveTask(id, status)),
  createEssayCategory: (category: Partial<EssayCategory>) =>
    call<EssayCategory>('essay_category_create', {category}, () => localDb.createEssayCategory(category)),
  updateEssayCategory: (category: Partial<EssayCategory> & {id: string}) =>
    call<EssayCategory>('essay_category_update', {category}, () => localDb.updateEssayCategory(category)),
  archiveEssayCategory: (id: string) =>
    call<EssayCategory>('essay_category_archive', {id}, () => localDb.archiveEssayCategory(id)),
  createEssay: (essay: Partial<Essay>) => call<Essay>('essay_create', {essay}, () => localDb.createEssay(essay)),
  updateEssay: (essay: Partial<Essay> & {id: string}) =>
    call<Essay>('essay_update', {essay}, () => localDb.updateEssay(essay)),
  archiveEssay: (id: string) => call<Essay>('essay_archive', {id}, () => localDb.archiveEssay(id)),
  updateSettings: (settings: Partial<Settings>) =>
    call<Settings>('settings_update', {settings}, () => localDb.updateSettings(settings)),
  sendMessage: (content: string, conversationId?: string) =>
    call('chat_send', {content, conversationId}, () => localDb.sendMessage(content, conversationId)),
};
