import {create} from 'zustand';
import type {PanelKey} from '../../shared/types';

interface UiState {
  activePanel: PanelKey;
  selectedEssayId?: string;
  selectedConversationId?: string;
  setActivePanel: (panel: PanelKey) => void;
  setSelectedEssayId: (id?: string) => void;
  setSelectedConversationId: (id?: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activePanel: 'dashboard',
  selectedEssayId: undefined,
  selectedConversationId: undefined,
  setActivePanel: (activePanel) => set({activePanel}),
  setSelectedEssayId: (selectedEssayId) => set({selectedEssayId}),
  setSelectedConversationId: (selectedConversationId) => set({selectedConversationId}),
}));
