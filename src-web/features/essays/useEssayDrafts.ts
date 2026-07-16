import {useCallback, useEffect, useRef, useState} from 'react';
import {normalizeTags} from '../../shared/utils/essay';

const DRAFT_STORAGE_KEY = 'fastnote:essay-drafts:v1';
const SAVE_DELAY_MS = 300;

export interface EssayDraft {
  content: string;
  tags: string[];
  updatedAt: string;
}

type EssayDrafts = Record<string, EssayDraft>;

function readDrafts(): EssayDrafts {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EssayDrafts) : {};
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
    (key: string, content: string, tags: string[]) => {
      const normalizedTags = normalizeTags(tags);
      const next = {...draftsRef.current};
      if (!content && normalizedTags.length === 0) {
        delete next[key];
      } else {
        next[key] = {content, tags: normalizedTags, updatedAt: new Date().toISOString()};
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
