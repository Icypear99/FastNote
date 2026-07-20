import {useCallback, useEffect, useRef, useState} from 'react';
import {normalizeTags} from '../../shared/utils/essay';
import type {EssayAttachment} from '../../shared/types';

const DRAFT_STORAGE_KEY = 'fastnote:essay-drafts:v1';
const SAVE_DELAY_MS = 300;

export interface EssayDraft {
  content: string;
  contentFormat: 'markdown' | 'tiptap-json';
  contentJson: string;
  tags: string[];
  attachments: EssayAttachment[];
  updatedAt: string;
}

export type EssayDraftInput = Omit<EssayDraft, 'updatedAt'>;

type EssayDrafts = Record<string, EssayDraft>;

function readDrafts(): EssayDrafts {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const stored = JSON.parse(raw) as Record<string, Partial<EssayDraft>>;
    return Object.fromEntries(
      Object.entries(stored).map(([key, draft]) => [
        key,
        {
          content: draft.content || '',
          contentFormat: draft.contentFormat || (draft.contentJson ? 'tiptap-json' : 'markdown'),
          contentJson: draft.contentJson || '',
          tags: draft.tags || [],
          attachments: draft.attachments || [],
          updatedAt: draft.updatedAt || new Date().toISOString(),
        },
      ]),
    );
  } catch (error) {
    console.warn('Failed to read essay drafts', error);
    return {};
  }
}

function persistDrafts(drafts: EssayDrafts) {
  try {
    if (Object.keys(drafts).length === 0) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } else {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
    }
  } catch (error) {
    console.warn('Failed to persist essay drafts', error);
  }
}

export function useEssayDrafts() {
  const initialDrafts = useRef<EssayDrafts>(readDrafts());
  const draftsRef = useRef<EssayDrafts>(initialDrafts.current);
  const [drafts, setDrafts] = useState<EssayDrafts>(initialDrafts.current);
  const timerRef = useRef<number | undefined>(undefined);

  const applyDrafts = useCallback((next: EssayDrafts) => {
    draftsRef.current = next;
    setDrafts(next);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => persistDrafts(draftsRef.current), SAVE_DELAY_MS);
  }, []);

  const updateDraft = useCallback(
    (key: string, draft: EssayDraftInput) => {
      const normalizedTags = normalizeTags(draft.tags);
      const next = {...draftsRef.current};
      if (!draft.content && normalizedTags.length === 0 && draft.attachments.length === 0) {
        delete next[key];
      } else {
        next[key] = {...draft, tags: normalizedTags, updatedAt: new Date().toISOString()};
      }
      applyDrafts(next);
    },
    [applyDrafts],
  );

  const removeDraft = useCallback(
    (key: string) => {
      const next = {...draftsRef.current};
      delete next[key];
      applyDrafts(next);
      persistDrafts(next);
    },
    [applyDrafts],
  );

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
      persistDrafts(draftsRef.current);
    },
    [],
  );

  return {drafts, updateDraft, removeDraft};
}
