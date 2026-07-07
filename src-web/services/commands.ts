import {invoke} from '@tauri-apps/api/core';
import type {Note, Settings, Task, TaskStatus, UserProfile, WorkspaceSnapshot} from '../types';
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
  createTask: (task: Partial<Task>) => call<Task>('task_create', {task}, () => localDb.createTask(task)),
  updateTask: (task: Partial<Task> & {id: string}) =>
    call<Task>('task_update', {task}, () => localDb.updateTask(task)),
  archiveTask: (id: string) => call<Task>('task_archive', {id}, () => localDb.archiveTask(id)),
  moveTask: (id: string, status: TaskStatus) =>
    call<Task>('task_move', {id, status}, () => localDb.moveTask(id, status)),
  createNote: (note: Partial<Note>) => call<Note>('note_create', {note}, () => localDb.createNote(note)),
  updateNote: (note: Partial<Note> & {id: string}) =>
    call<Note>('note_update', {note}, () => localDb.updateNote(note)),
  archiveNote: (id: string) => call<Note>('note_archive', {id}, () => localDb.archiveNote(id)),
  updateSettings: (settings: Partial<Settings>) =>
    call<Settings>('settings_update', {settings}, () => localDb.updateSettings(settings)),
  sendMessage: (content: string, conversationId?: string) =>
    call('chat_send', {content, conversationId}, () => localDb.sendMessage(content, conversationId)),
};
