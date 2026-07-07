import {create} from 'zustand';
import type {PanelKey} from '../types';

interface UiState {
  activePanel: PanelKey;
  selectedNoteId?: string;
  selectedConversationId?: string;
  setActivePanel: (panel: PanelKey) => void;
  setSelectedNoteId: (id?: string) => void;
  setSelectedConversationId: (id?: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activePanel: 'dashboard',
  selectedNoteId: undefined,
  selectedConversationId: undefined,
  setActivePanel: (activePanel) => set({activePanel}),
  setSelectedNoteId: (selectedNoteId) => set({selectedNoteId}),
  setSelectedConversationId: (selectedConversationId) => set({selectedConversationId}),
}));
