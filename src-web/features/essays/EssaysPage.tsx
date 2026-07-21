import {useEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {differenceInCalendarDays} from 'date-fns';
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Check,
  ChevronDown,
  Hash,
  Inbox,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PencilLine,
  Pin,
  RotateCcw,
  Save,
  Search,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {Markdown} from '@astryxdesign/core/Markdown';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {Token} from '@astryxdesign/core/Token';
import {VStack} from '@astryxdesign/core/VStack';
import type {Essay} from '../../shared/types';
import {commands} from '../../core/services/commands';
import {deriveEssayMetadata, normalizeTags, tagKey} from '../../shared/utils/essay';
import {useEssayDrafts} from './useEssayDrafts';
import type {EssayDraft, EssayDraftInput} from './useEssayDrafts';
import {AppConfirmDialog, useAppFeedback} from '../../shared/components/feedback';
import {AttachmentTray, RichTextEditor, RichTextViewer} from './editor/RichTextEditor';

const NEW_DRAFT_KEY = 'new';
const EMPTY_DRAFT: EssayDraft = {
  content: '',
  contentFormat: 'tiptap-json',
  contentJson: '',
  tags: [],
  attachments: [],
  updatedAt: '',
};

type EssayFilter = 'all' | 'trash' | `tag:${string}`;
type EssaySort = 'created-desc' | 'created-asc' | 'updated-desc' | 'updated-asc';

const ESSAY_SORT_OPTIONS: Array<{value: EssaySort; label: string; detail: string}> = [
  {value: 'created-desc', label: '创建时间', detail: '从新到旧'},
  {value: 'created-asc', label: '创建时间', detail: '从旧到新'},
  {value: 'updated-desc', label: '编辑时间', detail: '从新到旧'},
  {value: 'updated-asc', label: '编辑时间', detail: '从旧到新'},
];

interface TagStat {
  key: string;
  label: string;
  count: number;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sameTags(left: string[], right: string[]) {
  const normalizedLeft = normalizeTags(left).map(tagKey).sort();
  const normalizedRight = normalizeTags(right).map(tagKey).sort();
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((tag, index) => tag === normalizedRight[index]);
}

function essayDraft(essay: Essay): EssayDraft {
  return {
    content: essay.content,
    contentFormat: essay.contentFormat,
    contentJson: essay.contentJson,
    tags: essay.tags,
    attachments: essay.attachments,
    updatedAt: essay.updatedAt,
  };
}

function sameAttachmentIds(left: EssayDraft['attachments'], right: EssayDraft['attachments']) {
  return left.length === right.length && left.every((attachment, index) => attachment.id === right[index]?.id);
}

function essayCharacterCount(content: string) {
  return Array.from(content.replace(/\s/g, '')).length;
}

function formatEssayEditedAt(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export default function EssaysPage({
  essays,
  searchQuery,
  onSearchChange,
  onClearSearch,
  run,
}: {
  essays: Essay[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClearSearch: () => void;
  run: <T>(action: Promise<T>) => Promise<T>;
}) {
  const feedback = useAppFeedback();
  const {drafts, updateDraft, removeDraft} = useEssayDrafts();
  const [filter, setFilter] = useState<EssayFilter>('all');
  const [sortMode, setSortMode] = useState<EssaySort>('created-desc');
  const [isEssayRailCollapsed, setIsEssayRailCollapsed] = useState(false);
  const [isComposerPageExpanded, setIsComposerPageExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [detachedEditorId, setDetachedEditorId] = useState<string>();
  const [isPublishing, setIsPublishing] = useState(false);
  const [composerSession, setComposerSession] = useState(0);
  const [savingId, setSavingId] = useState<string>();
  const [pinningId, setPinningId] = useState<string>();
  const [restoringId, setRestoringId] = useState<string>();
  const [pendingArchive, setPendingArchive] = useState<Essay>();
  const [pendingPermanentDelete, setPendingPermanentDelete] = useState<Essay>();
  const [isEmptyTrashConfirmOpen, setIsEmptyTrashConfirmOpen] = useState(false);
  const [pendingDiscard, setPendingDiscard] = useState<Essay>();
  const [isArchiving, setIsArchiving] = useState(false);
  const [permanentlyDeletingId, setPermanentlyDeletingId] = useState<string>();
  const [isEmptyingTrash, setIsEmptyingTrash] = useState(false);
  const [actionError, setActionError] = useState('');

  const activeEssays = useMemo(() => essays.filter((essay) => !essay.archivedAt), [essays]);
  const archivedEssays = useMemo(() => essays.filter((essay) => essay.archivedAt), [essays]);
  const tagStats = useMemo<TagStat[]>(() => {
    const stats = new Map<string, TagStat>();
    activeEssays.forEach((essay) => {
      const uniqueTags = new Map(normalizeTags(essay.tags).map((tag) => [tagKey(tag), tag]));
      uniqueTags.forEach((label, key) => {
        const current = stats.get(key);
        stats.set(key, current ? {...current, count: current.count + 1} : {key, label, count: 1});
      });
    });
    return [...stats.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-CN'));
  }, [activeEssays]);

  const recordDays = useMemo(() => {
    const timestamps = activeEssays.map((essay) => Date.parse(essay.createdAt)).filter(Number.isFinite);
    if (!timestamps.length) return 0;
    return Math.max(1, differenceInCalendarDays(new Date(), new Date(Math.min(...timestamps))) + 1);
  }, [activeEssays]);

  const visibleEssays = useMemo(() => {
    const source = filter === 'trash' ? archivedEssays : activeEssays;
    const byTag = filter.startsWith('tag:')
      ? source.filter((essay) => essay.tags.some((tag) => tagKey(tag) === filter.slice(4)))
      : source;
    const query = searchQuery.trim().toLocaleLowerCase('zh-CN');
    const filtered = query
      ? byTag.filter((essay) => [essay.title, essay.summary, essay.content, ...essay.tags].join('\n').toLocaleLowerCase('zh-CN').includes(query))
      : byTag;
    const [sortField, sortDirection] = sortMode.split('-') as ['created' | 'updated', 'asc' | 'desc'];
    return [...filtered].sort((left, right) => {
      if (filter !== 'trash' && left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
      const leftTime = Date.parse(sortField === 'created' ? left.createdAt : left.updatedAt);
      const rightTime = Date.parse(sortField === 'created' ? right.createdAt : right.updatedAt);
      return sortDirection === 'asc' ? leftTime - rightTime : rightTime - leftTime;
    });
  }, [activeEssays, archivedEssays, filter, searchQuery, sortMode]);

  const publishEssay = async () => {
    const draft = drafts[NEW_DRAFT_KEY] ?? EMPTY_DRAFT;
    if ((!draft.content.trim() && !draft.attachments.length) || isPublishing) return;
    setActionError('');
    setIsPublishing(true);
    try {
      const metadata = deriveEssayMetadata(draft.content);
      await run(
        commands.createEssay({
          ...metadata,
          content: draft.content,
          contentFormat: draft.contentFormat,
          contentJson: draft.contentJson,
          tags: normalizeTags(draft.tags),
          attachments: draft.attachments,
          attachmentIds: draft.attachments.map((attachment) => attachment.id),
          status: 'published',
        }),
      );
      removeDraft(NEW_DRAFT_KEY);
      setComposerSession((session) => session + 1);
      window.setTimeout(() => document.querySelector<HTMLElement>('.essay-composer .ProseMirror')?.focus(), 0);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setIsPublishing(false);
    }
  };

  const saveEssay = async (essay: Essay) => {
    const draft = drafts[essay.id] ?? essayDraft(essay);
    if ((!draft.content.trim() && !draft.attachments.length) || savingId) return;
    setActionError('');
    setSavingId(essay.id);
    try {
      const metadata = deriveEssayMetadata(draft.content);
      await run(commands.updateEssay({
        ...metadata,
        id: essay.id,
        content: draft.content,
        contentFormat: draft.contentFormat,
        contentJson: draft.contentJson,
        tags: normalizeTags(draft.tags),
        attachments: draft.attachments,
        attachmentIds: draft.attachments.map((attachment) => attachment.id),
      }));
      removeDraft(essay.id);
      setEditingId(undefined);
      if (detachedEditorId === essay.id) setDetachedEditorId(undefined);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setSavingId(undefined);
    }
  };

  const archiveEssay = async () => {
    if (!pendingArchive || isArchiving) return;
    setActionError('');
    setIsArchiving(true);
    try {
      await run(commands.archiveEssay(pendingArchive.id));
      if (editingId === pendingArchive.id) setEditingId(undefined);
      feedback.success('随笔已移入回收站。', 'essay-delete-success');
      setPendingArchive(undefined);
    } catch (error) {
      const message = errorMessage(error);
      setActionError(message);
      feedback.error(message, 'essay-delete-error');
    } finally {
      setIsArchiving(false);
    }
  };

  const restoreEssay = async (essay: Essay) => {
    if (restoringId) return;
    setActionError('');
    setRestoringId(essay.id);
    try {
      await run(commands.restoreEssay(essay.id));
      feedback.success('随笔已恢复。', 'essay-restore-success');
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setRestoringId(undefined);
    }
  };

  const toggleEssayPin = async (essay: Essay) => {
    if (pinningId) return;
    setActionError('');
    setPinningId(essay.id);
    try {
      await run(commands.updateEssay({id: essay.id, isPinned: !essay.isPinned}));
      feedback.success(essay.isPinned ? '已取消置顶。' : '随笔已置顶。', `essay-pin-${essay.id}`);
    } catch (error) {
      const message = errorMessage(error);
      setActionError(message);
      feedback.error(message, 'essay-pin-error');
    } finally {
      setPinningId(undefined);
    }
  };

  const deleteEssayPermanently = async () => {
    if (!pendingPermanentDelete || permanentlyDeletingId) return;
    setActionError('');
    setPermanentlyDeletingId(pendingPermanentDelete.id);
    try {
      await run(commands.deleteEssayPermanently(pendingPermanentDelete.id));
      removeDraft(pendingPermanentDelete.id);
      feedback.success('随笔已永久删除。', 'essay-permanent-delete-success');
      setPendingPermanentDelete(undefined);
    } catch (error) {
      const message = errorMessage(error);
      setActionError(message);
      feedback.error(message, 'essay-permanent-delete-error');
    } finally {
      setPermanentlyDeletingId(undefined);
    }
  };

  const emptyEssayTrash = async () => {
    if (isEmptyingTrash || archivedEssays.length === 0) return;
    setActionError('');
    setIsEmptyingTrash(true);
    try {
      const deletedCount = await run(commands.emptyEssayTrash());
      archivedEssays.forEach((essay) => removeDraft(essay.id));
      feedback.success(`已永久删除 ${deletedCount} 篇随笔。`, 'essay-empty-trash-success');
      setIsEmptyTrashConfirmOpen(false);
    } catch (error) {
      const message = errorMessage(error);
      setActionError(message);
      feedback.error(message, 'essay-empty-trash-error');
    } finally {
      setIsEmptyingTrash(false);
    }
  };

  const cancelEditing = (essay: Essay) => {
    const draft = drafts[essay.id];
    if (
      draft &&
      (draft.content !== essay.content ||
        draft.contentJson !== essay.contentJson ||
        !sameTags(draft.tags, essay.tags) ||
        !sameAttachmentIds(draft.attachments, essay.attachments))
    ) {
      setPendingDiscard(essay);
      return;
    }
    removeDraft(essay.id);
    setEditingId(undefined);
  };

  const discardDraft = () => {
    if (!pendingDiscard) return;
    removeDraft(pendingDiscard.id);
    setEditingId(undefined);
    setPendingDiscard(undefined);
  };

  const newDraft = drafts[NEW_DRAFT_KEY] ?? EMPTY_DRAFT;
  const isTrash = filter === 'trash';
  const selectedTag = filter.startsWith('tag:') ? tagStats.find((tag) => tag.key === filter.slice(4)) : undefined;
  const currentTitle = isTrash ? '回收站' : selectedTag ? `#${selectedTag.label}` : '全部随笔';
  const knownTags = tagStats.map((tag) => tag.label);
  const detachedEssay = detachedEditorId ? activeEssays.find((essay) => essay.id === detachedEditorId) : undefined;
  const detachedDraft = detachedEssay ? drafts[detachedEssay.id] ?? essayDraft(detachedEssay) : undefined;
  const focusComposer = () => {
    window.setTimeout(() => document.querySelector<HTMLElement>('.essay-composer .ProseMirror')?.focus(), 0);
  };

  const openDetachedEditor = (id: string) => {
    setEditingId(undefined);
    setDetachedEditorId(id);
  };

  const importImages = async (key: string, draft: EssayDraft, files: File[]) => {
    const imported = await Promise.all(files.map((file) => commands.importEssayAttachment(file)));
    updateDraft(key, {
      ...draft,
      attachments: [...draft.attachments, ...imported],
    });
  };

  return (
    <>
      <section className={`task-workspace essay-workspace ${isEssayRailCollapsed ? 'project-rail-collapsed' : ''}`}>
        <aside className={`project-rail essay-rail ${isEssayRailCollapsed ? 'collapsed' : ''}`} aria-label="随笔筛选">
          <EssayFilters
            activeCount={activeEssays.length}
            archivedCount={archivedEssays.length}
            filter={filter}
            isCollapsed={isEssayRailCollapsed}
            recordDays={recordDays}
            tagStats={tagStats}
            onChange={setFilter}
            onCollapse={() => setIsEssayRailCollapsed(true)}
            onExpand={() => setIsEssayRailCollapsed(false)}
          />
        </aside>
        <section className={`task-main essay-main ${isTrash ? 'trash-view' : ''} ${actionError ? 'has-feedback' : ''} ${isComposerPageExpanded ? 'composer-page-expanded' : ''}`} aria-label="随笔内容">
          <header className="task-module-header essay-module-header">
            <section className="essay-view-heading">
              <EssayViewMenu title={currentTitle} sortMode={sortMode} onSortChange={setSortMode} />
            </section>
            <div className="essay-header-tools">
              <div className="essay-search-box" role="search">
                <Search aria-hidden="true" />
                <input
                  data-essay-search
                  value={searchQuery}
                  aria-label="搜索随笔"
                  placeholder="Ctrl+K"
                  onChange={(event) => onSearchChange(event.currentTarget.value)}
                />
                {searchQuery && (
                  <button type="button" title="清除搜索" aria-label="清除随笔搜索" onClick={onClearSearch}>
                    <X aria-hidden="true" />
                  </button>
                )}
              </div>
              {isTrash && archivedEssays.length > 0 && (
                <button className="essay-empty-trash-btn" type="button" disabled={isEmptyingTrash} onClick={() => setIsEmptyTrashConfirmOpen(true)}>
                  <Trash2 aria-hidden="true" />
                  清空回收站
                </button>
              )}
            </div>
          </header>
          {actionError && (
            <VStack className="task-feedback-stack" gap={2} padding={3}>
              <Banner
                status="error"
                title="操作未完成"
                description={actionError}
                isDismissable
                onDismiss={() => setActionError('')}
              />
            </VStack>
          )}
          {!isTrash && (
            <section className={`essay-composer-band ${isComposerPageExpanded ? 'page-expanded' : ''}`} aria-label="快速记录">
              <VStack className="essay-content-column" gap={0}>
                <div className="essay-composer-shell">
                  <button
                    className="essay-composer-expand"
                    type="button"
                    title={isComposerPageExpanded ? '还原编辑器' : '放大编辑器'}
                    aria-label={isComposerPageExpanded ? '还原快速记录编辑器' : '在当前页面放大快速记录编辑器'}
                    onClick={() => setIsComposerPageExpanded((value) => !value)}
                  >
                    {isComposerPageExpanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
                  </button>
                  <EssayComposer
                    key={composerSession}
                    draft={newDraft}
                    isPublishing={isPublishing}
                    knownTags={knownTags}
                    referenceEssays={activeEssays}
                    onAddImages={(files) => importImages(NEW_DRAFT_KEY, newDraft, files)}
                    onChange={(draft) => updateDraft(NEW_DRAFT_KEY, draft)}
                    onError={setActionError}
                    onPublish={publishEssay}
                  />
                </div>
              </VStack>
            </section>
          )}
          {!isComposerPageExpanded && (
            <VStack className="essay-feed-scroll" gap={0}>
              <VStack className="essay-content-column" gap={3}>
                <EssayFeed
                drafts={drafts}
                editingId={editingId}
                essays={visibleEssays}
                filter={filter}
                searchQuery={searchQuery}
                permanentlyDeletingId={permanentlyDeletingId}
                pinningId={pinningId}
                restoringId={restoringId}
                savingId={savingId}
                knownTags={knownTags}
                referenceEssays={activeEssays}
                onArchive={setPendingArchive}
                onCancelEdit={cancelEditing}
                onChangeDraft={updateDraft}
                onClearFilter={() => setFilter('all')}
                onClearSearch={onClearSearch}
                onEdit={setEditingId}
                onOpenDetached={openDetachedEditor}
                onDeletePermanently={setPendingPermanentDelete}
                onTogglePin={toggleEssayPin}
                onRestore={restoreEssay}
                onSave={saveEssay}
                onImportImages={importImages}
                onError={setActionError}
                onStartWriting={focusComposer}
                onTagClick={(tag) => setFilter(`tag:${tagKey(tag)}`)}
                />
              </VStack>
            </VStack>
          )}
        </section>
      </section>
      <AppConfirmDialog
        isOpen={Boolean(pendingArchive)}
        onOpenChange={(isOpen) => !isOpen && !isArchiving && setPendingArchive(undefined)}
        title="删除这篇随笔？"
        description="随笔将移入回收站，之后可以恢复。"
        actionLabel="删除随笔"
        isLoading={isArchiving}
        onAction={archiveEssay}
      />
      <AppConfirmDialog
        isOpen={Boolean(pendingDiscard)}
        onOpenChange={(isOpen) => !isOpen && setPendingDiscard(undefined)}
        title="放弃本地草稿？"
        description="这次尚未保存的编辑内容会被清除，无法继续恢复。"
        actionLabel="放弃草稿"
        cancelLabel="继续编辑"
        onAction={discardDraft}
      />
      <AppConfirmDialog
        isOpen={Boolean(pendingPermanentDelete)}
        onOpenChange={(isOpen) => !isOpen && !permanentlyDeletingId && setPendingPermanentDelete(undefined)}
        title="永久删除这篇随笔？"
        description="随笔及其中的图片将被永久删除，此操作无法撤销。"
        actionLabel="永久删除"
        isLoading={Boolean(permanentlyDeletingId)}
        onAction={deleteEssayPermanently}
      />
      <AppConfirmDialog
        isOpen={isEmptyTrashConfirmOpen}
        onOpenChange={(isOpen) => !isEmptyingTrash && setIsEmptyTrashConfirmOpen(isOpen)}
        title="清空回收站？"
        description={`回收站中的 ${archivedEssays.length} 篇随笔及其中的图片将被永久删除，此操作无法撤销。`}
        actionLabel="清空回收站"
        isLoading={isEmptyingTrash}
        onAction={emptyEssayTrash}
      />
      {detachedEditorId && detachedDraft && (
        <DetachedEssayEditor
          draft={detachedDraft}
          essay={detachedEssay}
          isSaving={savingId === detachedEditorId}
          knownTags={knownTags}
          referenceEssays={activeEssays.filter((essay) => essay.id !== detachedEditorId)}
          onAddImages={(files) => importImages(detachedEditorId, detachedDraft, files)}
          onChange={(draft) => updateDraft(detachedEditorId, {...draft, attachments: detachedDraft.attachments})}
          onClose={() => setDetachedEditorId(undefined)}
          onError={setActionError}
          onRemoveAttachment={(id) => updateDraft(detachedEditorId, {...detachedDraft, attachments: detachedDraft.attachments.filter((attachment) => attachment.id !== id)})}
          onSubmit={() => detachedEssay ? saveEssay(detachedEssay) : Promise.resolve()}
        />
      )}
    </>
  );
}

function EssayFilters({
  activeCount,
  archivedCount,
  filter,
  isCollapsed,
  recordDays,
  tagStats,
  onChange,
  onCollapse,
  onExpand,
}: {
  activeCount: number;
  archivedCount: number;
  filter: EssayFilter;
  isCollapsed: boolean;
  recordDays: number;
  tagStats: TagStat[];
  onChange: (filter: EssayFilter) => void;
  onCollapse: () => void;
  onExpand: () => void;
}) {
  const selectedTag = filter.startsWith('tag:') ? tagStats.find((tag) => tag.key === filter.slice(4)) : undefined;
  const selectedLabel = filter === 'trash' ? '回收站' : selectedTag?.label ?? '全部随笔';
  const selectedCount = filter === 'trash' ? archivedCount : selectedTag?.count ?? activeCount;

  if (isCollapsed) {
    return (
      <button
        className={`project-rail-capsule essay-rail-capsule ${filter === 'trash' ? 'trash' : ''}`}
        type="button"
        title="展开随笔导航"
        aria-label={`展开随笔导航，当前${selectedLabel}，${selectedCount}篇随笔`}
        onClick={onExpand}
      >
        <PanelLeftOpen aria-hidden="true" />
        <span>{selectedLabel}</span>
        <small>{selectedCount}</small>
      </button>
    );
  }

  return (
    <>
      <header className="rail-heading project-rail-heading">
        <span className="project-rail-title">
          <span>随笔</span>
          <strong>{activeCount}</strong>
        </span>
        <button className="project-rail-toggle" type="button" title="收起随笔导航" aria-label="收起随笔导航" onClick={onCollapse}>
          <PanelLeftClose aria-hidden="true" />
        </button>
      </header>
      <button className={`project-filter ${filter === 'all' ? 'active' : ''}`} type="button" onClick={() => onChange('all')}>
        <span className="project-color-dot neutral" />
        <span>全部随笔</span>
        <small>{activeCount}</small>
      </button>
      <p className="essay-rail-meta">
        <span>{tagStats.length} 个标签</span>
        <span>记录 {recordDays} 天</span>
      </p>
      <nav className="project-filter-list essay-filter-list" aria-label="随笔标签">
        <span className="essay-filter-heading">全部标签</span>
        {tagStats.length ? (
          tagStats.map((tag) => (
            <button
              className={`project-filter ${filter === `tag:${tag.key}` ? 'active' : ''}`}
              type="button"
              key={tag.key}
              onClick={() => onChange(`tag:${tag.key}`)}
            >
              <span className="essay-filter-icon"><Hash aria-hidden="true" /></span>
              <span>{tag.label}</span>
              <small>{tag.count}</small>
            </button>
          ))
        ) : (
          <span className="essay-filter-empty">还没有标签</span>
        )}
      </nav>
      <button className={`project-filter project-trash-filter ${filter === 'trash' ? 'active' : ''}`} type="button" onClick={() => onChange('trash')}>
        <Trash2 aria-hidden="true" />
        <span>回收站</span>
        <small>{archivedCount}</small>
      </button>
    </>
  );
}

function EssayViewMenu({
  title,
  sortMode,
  onSortChange,
}: {
  title: string;
  sortMode: EssaySort;
  onSortChange: (sort: EssaySort) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentSort = ESSAY_SORT_OPTIONS.find((option) => option.value === sortMode) ?? ESSAY_SORT_OPTIONS[0];

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="essay-view-menu">
      <h2>
        <button
          className="essay-view-menu-trigger"
          type="button"
          aria-label={`${title}，当前按${currentSort.label}${currentSort.detail}排序`}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((value) => !value)}
        >
          <span>{title}</span>
          <ChevronDown aria-hidden="true" />
        </button>
      </h2>
      {isOpen && (
        <section className="essay-view-menu-card" aria-label="随笔排序菜单">
          <header>
            <ArrowDownUp aria-hidden="true" />
            <span>
              <strong>排序方式</strong>
              <small>{currentSort.label}，{currentSort.detail}</small>
            </span>
          </header>
          <div className="essay-sort-options" role="menu" aria-label="排序方式">
            {ESSAY_SORT_OPTIONS.map((option) => (
              <button
                className={sortMode === option.value ? 'active' : ''}
                type="button"
                role="menuitemradio"
                aria-checked={sortMode === option.value}
                key={option.value}
                onClick={() => {
                  onSortChange(option.value);
                  setIsOpen(false);
                }}
              >
                {option.value.endsWith('desc') ? <ArrowDown aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.detail}</small>
                </span>
                {sortMode === option.value && <Check className="essay-sort-check" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function EssayComposer({
  draft,
  isPublishing,
  knownTags,
  referenceEssays,
  onAddImages,
  onChange,
  onError,
  onPublish,
}: {
  draft: EssayDraft;
  isPublishing: boolean;
  knownTags: string[];
  referenceEssays: Essay[];
  onAddImages: (files: File[]) => Promise<void>;
  onChange: (draft: EssayDraftInput) => void;
  onError: (message: string) => void;
  onPublish: () => Promise<void>;
}) {
  return (
    <section className="essay-composer">
      <RichTextEditor
        value={draft}
        knownTags={knownTags}
        referenceEssays={referenceEssays}
        attachments={draft.attachments}
        isDisabled={isPublishing}
        isSubmitting={isPublishing}
        onChange={(value) => onChange({...value, attachments: draft.attachments})}
        onAddImages={onAddImages}
        onRemoveAttachment={(id) => onChange({...draft, attachments: draft.attachments.filter((attachment) => attachment.id !== id)})}
        onSubmit={onPublish}
        onError={onError}
      />
    </section>
  );
}

function DetachedEssayEditor({
  draft,
  essay,
  isSaving,
  knownTags,
  referenceEssays,
  onAddImages,
  onChange,
  onClose,
  onError,
  onRemoveAttachment,
  onSubmit,
}: {
  draft: EssayDraft;
  essay?: Essay;
  isSaving: boolean;
  knownTags: string[];
  referenceEssays: Essay[];
  onAddImages: (files: File[]) => Promise<void>;
  onChange: (draft: EssayDraftInput) => void;
  onClose: () => void;
  onError: (message: string) => void;
  onRemoveAttachment: (id: string) => void;
  onSubmit: () => Promise<void>;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <section
      className="essay-detached-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={essay ? '独立编辑随笔' : '独立新建随笔'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <article className="essay-detached-editor">
        <header className="essay-detached-header">
          <span>
            <small>{essay ? '编辑随笔' : '新随笔'}</small>
            <strong>{essay?.title || '记录此刻的想法'}</strong>
          </span>
          <button type="button" title="关闭" aria-label="关闭独立编辑器" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="essay-detached-body">
          <RichTextEditor
            value={draft}
            knownTags={knownTags}
            referenceEssays={referenceEssays}
            attachments={draft.attachments}
            isDisabled={isSaving}
            isSubmitting={isSaving}
            submitLabel={essay ? '保存随笔' : '发布随笔'}
            placeholder="现在的想法是..."
            onChange={(value) => onChange({...value, attachments: draft.attachments})}
            onAddImages={onAddImages}
            onRemoveAttachment={onRemoveAttachment}
            onSubmit={onSubmit}
            onError={onError}
          />
        </div>
      </article>
    </section>,
    document.body,
  );
}

function EssayFeed({
  drafts,
  editingId,
  essays,
  filter,
  searchQuery,
  permanentlyDeletingId,
  pinningId,
  restoringId,
  savingId,
  knownTags,
  referenceEssays,
  onArchive,
  onCancelEdit,
  onChangeDraft,
  onClearFilter,
  onClearSearch,
  onEdit,
  onOpenDetached,
  onDeletePermanently,
  onTogglePin,
  onError,
  onImportImages,
  onRestore,
  onSave,
  onStartWriting,
  onTagClick,
}: {
  drafts: Record<string, EssayDraft>;
  editingId?: string;
  essays: Essay[];
  filter: EssayFilter;
  searchQuery: string;
  permanentlyDeletingId?: string;
  pinningId?: string;
  restoringId?: string;
  savingId?: string;
  knownTags: string[];
  referenceEssays: Essay[];
  onArchive: (essay: Essay) => void;
  onCancelEdit: (essay: Essay) => void;
  onChangeDraft: (key: string, draft: EssayDraftInput) => void;
  onClearFilter: () => void;
  onClearSearch: () => void;
  onEdit: (id: string) => void;
  onOpenDetached: (id: string) => void;
  onDeletePermanently: (essay: Essay) => void;
  onTogglePin: (essay: Essay) => Promise<void>;
  onError: (message: string) => void;
  onImportImages: (key: string, draft: EssayDraft, files: File[]) => Promise<void>;
  onRestore: (essay: Essay) => Promise<void>;
  onSave: (essay: Essay) => Promise<void>;
  onStartWriting: () => void;
  onTagClick: (tag: string) => void;
}) {
  if (!essays.length) {
    const isTrash = filter === 'trash';
    const isFiltered = filter.startsWith('tag:');
    const isSearching = Boolean(searchQuery.trim());
    return (
      <EmptyState
        headingLevel={2}
        icon={isTrash ? <Trash2 /> : isFiltered ? <Tags /> : <Inbox />}
        title={isSearching ? '没有匹配的随笔' : isTrash ? '回收站为空' : isFiltered ? '该标签下没有随笔' : '还没有随笔'}
        description={isSearching ? `没有找到包含“${searchQuery.trim()}”的内容。` : isTrash ? '已删除的随笔会出现在这里，并且可以随时恢复。' : isFiltered ? '可以切换标签，或回到全部随笔。' : '从上方输入框记录第一个想法。'}
        actions={
          isSearching ? (
            <Button label="清除搜索" variant="secondary" onClick={onClearSearch} />
          ) : isFiltered ? (
            <Button label="查看全部随笔" variant="secondary" onClick={onClearFilter} />
          ) : !isTrash ? (
            <Button label="开始记录" variant="secondary" onClick={onStartWriting} />
          ) : undefined
        }
      />
    );
  }

  return (
    <VStack as="section" className="essay-feed" gap={0} aria-label={filter === 'trash' ? '已删除随笔' : '随笔列表'}>
      {essays.map((essay) => {
        const isEditing = editingId === essay.id && filter !== 'trash';
        const draft = drafts[essay.id] ?? essayDraft(essay);
        return (
          <article className="essay-feed-item" key={essay.id}>
            {isEditing ? (
              <VStack className="essay-inline-editor" gap={3}>
                <RichTextEditor
                  value={draft}
                  knownTags={knownTags}
                  referenceEssays={referenceEssays.filter((item) => item.id !== essay.id)}
                  attachments={draft.attachments}
                  isDisabled={savingId === essay.id}
                  onChange={(value) => onChangeDraft(essay.id, {...value, attachments: draft.attachments})}
                  onAddImages={(files) => onImportImages(essay.id, draft, files)}
                  onRemoveAttachment={(id) =>
                    onChangeDraft(essay.id, {
                      ...draft,
                      attachments: draft.attachments.filter((attachment) => attachment.id !== id),
                    })
                  }
                  onError={onError}
                />
                <HStack gap={2} hAlign="end">
                  <Button label="取消编辑" icon={<X aria-hidden="true" />} variant="ghost" onClick={() => onCancelEdit(essay)} />
                  <Button
                    label="保存随笔"
                    icon={<Save aria-hidden="true" />}
                    variant="primary"
                    isLoading={savingId === essay.id}
                    isDisabled={!draft.content.trim() && !draft.attachments.length}
                    onClick={() => void onSave(essay)}
                  />
                </HStack>
              </VStack>
            ) : (
              <VStack gap={3}>
                <HStack className="essay-feed-item-header" gap={2} hAlign="between" vAlign="center">
                  {filter === 'trash' ? (
                    <span className="essay-deleted-at">
                      删除于 <Timestamp value={essay.archivedAt ?? essay.updatedAt} format="date_time" hasTooltip={false} />
                    </span>
                  ) : (
                    <HStack className="essay-published-meta" gap={1} vAlign="center">
                      <Timestamp value={essay.createdAt} format="date_time" hasTooltip={false} />
                      {essay.isPinned && (
                        <span className="essay-pinned-label">
                          <Pin aria-hidden="true" />
                          已置顶
                        </span>
                      )}
                    </HStack>
                  )}
                  {filter === 'trash' ? (
                    <EssayActionsMenu
                      mode="trash"
                      essay={essay}
                      isDisabled={Boolean(restoringId) || Boolean(permanentlyDeletingId)}
                      onRestore={onRestore}
                      onDeletePermanently={onDeletePermanently}
                    />
                  ) : (
                    <EssayActionsMenu
                      essay={essay}
                      isDisabled={Boolean(savingId) || Boolean(pinningId)}
                      onArchive={onArchive}
                      onEdit={onEdit}
                      onOpenDetached={onOpenDetached}
                      onTogglePin={onTogglePin}
                    />
                  )}
                </HStack>
                {essay.tags.length > 0 && (
                  <HStack className="essay-feed-tags" gap={1} wrap="wrap">
                    {normalizeTags(essay.tags).map((tag) => (
                      <Token
                        key={tagKey(tag)}
                        label={`#${tag}`}
                        size="sm"
                        color="blue"
                        onClick={filter === 'trash' ? undefined : () => onTagClick(tag)}
                      />
                    ))}
                  </HStack>
                )}
                {essay.contentFormat === 'tiptap-json' ? (
                  <RichTextViewer essay={essay} />
                ) : (
                  <Markdown className="essay-feed-markdown" density="compact" headingLevelStart={3} contentWidth="100%" autolink="gfm">
                    {essay.content}
                  </Markdown>
                )}
                <AttachmentTray attachments={essay.attachments} isEditable={false} onRemove={() => undefined} />
              </VStack>
            )}
          </article>
        );
      })}
    </VStack>
  );
}

function EssayActionsMenu({
  essay,
  isDisabled,
  ...actions
}: {
  essay: Essay;
  isDisabled: boolean;
} & (
  | {
      mode: 'trash';
      onDeletePermanently: (essay: Essay) => void;
      onRestore: (essay: Essay) => Promise<void>;
    }
  | {
      mode?: 'active';
      onArchive: (essay: Essay) => void;
      onEdit: (id: string) => void;
      onOpenDetached: (id: string) => void;
      onTogglePin: (essay: Essay) => Promise<void>;
    }
)) {
  const isTrashMenu = actions.mode === 'trash';
  const menuLabel = isTrashMenu ? '回收站随笔操作' : '随笔操作';
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({left: 0, top: 0});
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target) &&
        !menuRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    const closeOnViewportChange = () => setIsOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', closeOnViewportChange);
    document.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', closeOnViewportChange);
      document.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, [isOpen]);

  const runAction = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  const toggleMenu = () => {
    if (!isOpen) {
      const triggerBounds = rootRef.current?.getBoundingClientRect();
      if (triggerBounds) {
        const menuWidth = 224;
        const menuHeight = isTrashMenu ? 84 : 218;
        const viewportMargin = 12;
        const gap = 6;
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = document.documentElement.clientHeight;
        const opensUpward = viewportHeight - triggerBounds.bottom < menuHeight + gap + viewportMargin;
        setMenuPosition({
          left: Math.min(
            Math.max(viewportMargin, triggerBounds.right - menuWidth),
            viewportWidth - menuWidth - viewportMargin,
          ),
          top: opensUpward
            ? Math.max(viewportMargin, triggerBounds.top - menuHeight - gap)
            : Math.min(viewportHeight - menuHeight - viewportMargin, triggerBounds.bottom + gap),
        });
      }
    }
    setIsOpen((value) => !value);
  };

  return (
    <div ref={rootRef} className="essay-action-menu">
      <button
        className={`essay-action-menu-trigger ${isOpen ? 'active' : ''}`}
        type="button"
        title={menuLabel}
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={isDisabled}
        onClick={toggleMenu}
      >
        <MoreHorizontal aria-hidden="true" />
      </button>
      {isOpen && createPortal(
        <section ref={menuRef} className="essay-action-menu-card" style={menuPosition} aria-label={`${menuLabel}菜单`}>
          <div className="essay-action-menu-items" role="menu" aria-label={menuLabel}>
            {isTrashMenu ? (
              <>
                <button type="button" role="menuitem" onClick={() => runAction(() => void actions.onRestore(essay))}>
                  <RotateCcw aria-hidden="true" />
                  恢复
                </button>
                <button className="danger" type="button" role="menuitem" onClick={() => runAction(() => actions.onDeletePermanently(essay))}>
                  <Trash2 aria-hidden="true" />
                  删除
                </button>
              </>
            ) : (
              <>
                <button type="button" role="menuitem" onClick={() => runAction(() => actions.onEdit(essay.id))}>
                  <PencilLine aria-hidden="true" />
                  编辑
                </button>
                <button type="button" role="menuitem" onClick={() => runAction(() => actions.onOpenDetached(essay.id))}>
                  <Maximize2 aria-hidden="true" />
                  独立编辑
                </button>
                <button type="button" role="menuitem" onClick={() => runAction(() => void actions.onTogglePin(essay))}>
                  <Pin aria-hidden="true" />
                  {essay.isPinned ? '取消置顶' : '置顶'}
                </button>
                <button className="danger" type="button" role="menuitem" onClick={() => runAction(() => actions.onArchive(essay))}>
                  <Trash2 aria-hidden="true" />
                  删除
                </button>
              </>
            )}
          </div>
          {!isTrashMenu && (
            <footer className="essay-action-menu-footer">
              <span>字数统计：{essayCharacterCount(essay.content)}</span>
              <span>编辑于 {formatEssayEditedAt(essay.updatedAt)}</span>
            </footer>
          )}
        </section>,
        document.body,
      )}
    </div>
  );
}
