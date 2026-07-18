import {create} from 'zustand';
import type {ViewKey} from './types';

interface UiState {
  activeView: ViewKey;
  selectedNoteId?: string;
  selectedConversationId?: string;
  setActiveView: (view: ViewKey) => void;
  setSelectedNoteId: (id?: string) => void;
  setSelectedConversationId: (id?: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeView: 'dashboard',
  selectedNoteId: undefined,
  selectedConversationId: undefined,
  setActiveView: (activeView) => set({activeView}),
  setSelectedNoteId: (selectedNoteId) => set({selectedNoteId}),
  setSelectedConversationId: (selectedConversationId) => set({selectedConversationId}),
}));
