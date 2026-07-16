import {create} from 'zustand';
import type {PanelKey} from '../../shared/types';

interface UiState {
  activePanel: PanelKey;
  selectedConversationId?: string;
  setActivePanel: (panel: PanelKey) => void;
  setSelectedConversationId: (id?: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activePanel: 'dashboard',
  selectedConversationId: undefined,
  setActivePanel: (activePanel) => set({activePanel}),
  setSelectedConversationId: (selectedConversationId) => set({selectedConversationId}),
}));
