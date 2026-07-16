import {useEffect, useMemo, useRef, useState} from 'react';
import type {FormEvent, KeyboardEvent, RefObject} from 'react';
import {differenceInCalendarDays} from 'date-fns';
import {
  Hash,
  Inbox,
  PanelLeftClose,
  PanelLeftOpen,
  PencilLine,
  RotateCcw,
  Save,
  Send,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Markdown} from '@astryxdesign/core/Markdown';
import {MoreMenu} from '@astryxdesign/core/MoreMenu';
import {TextArea} from '@astryxdesign/core/TextArea';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {Token} from '@astryxdesign/core/Token';
import {Tokenizer} from '@astryxdesign/core/Tokenizer';
import type {SearchableItem, SearchSource} from '@astryxdesign/core/Typeahead';
import {VStack} from '@astryxdesign/core/VStack';
import type {Essay} from '../../shared/types';
import {commands} from '../../core/services/commands';
import {deriveEssayMetadata, normalizeTags, tagKey} from '../../shared/utils/essay';
import {useEssayDrafts} from './useEssayDrafts';
import type {EssayDraft} from './useEssayDrafts';
import {AppConfirmDialog, useAppFeedback} from '../../shared/components/feedback';

const NEW_DRAFT_KEY = 'new';
const EMPTY_DRAFT: EssayDraft = {content: '', tags: [], updatedAt: ''};

type EssayFilter = 'all' | 'trash' | `tag:${string}`;

interface TagStat {
  key: string;
  label: string;
  count: number;
}

interface TagItem extends SearchableItem {
  id: string;
  label: string;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sameTags(left: string[], right: string[]) {
  const normalizedLeft = normalizeTags(left).map(tagKey).sort();
  const normalizedRight = normalizeTags(right).map(tagKey).sort();
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((tag, index) => tag === normalizedRight[index]);
}

function tagItems(tags: string[]): TagItem[] {
  return normalizeTags(tags).map((tag) => ({id: tagKey(tag), label: tag}));
}

export default function EssaysPage({
  essays,
  run,
}: {
  essays: Essay[];
  run: <T>(action: Promise<T>) => Promise<T>;
}) {
  const feedback = useAppFeedback();
  const {drafts, updateDraft, removeDraft} = useEssayDrafts();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [filter, setFilter] = useState<EssayFilter>('all');
  const [isEssayRailCollapsed, setIsEssayRailCollapsed] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [isPublishing, setIsPublishing] = useState(false);
  const [savingId, setSavingId] = useState<string>();
  const [restoringId, setRestoringId] = useState<string>();
  const [pendingArchive, setPendingArchive] = useState<Essay>();
  const [pendingDiscard, setPendingDiscard] = useState<Essay>();
  const [isArchiving, setIsArchiving] = useState(false);
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
  const searchableTags = useMemo(() => tagStats.map(({key, label}) => ({id: key, label})), [tagStats]);
  const tagSource = useMemo<SearchSource<TagItem>>(
    () => ({
      search: (query) => {
        const normalizedQuery = tagKey(query);
        return searchableTags.filter((tag) => tag.id.includes(normalizedQuery));
      },
      bootstrap: () => searchableTags,
    }),
    [searchableTags],
  );

  const recordDays = useMemo(() => {
    const timestamps = activeEssays.map((essay) => Date.parse(essay.createdAt)).filter(Number.isFinite);
    if (!timestamps.length) return 0;
    return Math.max(1, differenceInCalendarDays(new Date(), new Date(Math.min(...timestamps))) + 1);
  }, [activeEssays]);

  const visibleEssays = useMemo(() => {
    const source = filter === 'trash' ? archivedEssays : activeEssays;
    const filtered = filter.startsWith('tag:')
      ? source.filter((essay) => essay.tags.some((tag) => tagKey(tag) === filter.slice(4)))
      : source;
    return [...filtered].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }, [activeEssays, archivedEssays, filter]);

  const publishEssay = async () => {
    const draft = drafts[NEW_DRAFT_KEY] ?? EMPTY_DRAFT;
    if (!draft.content.trim() || isPublishing) return;
    setActionError('');
    setIsPublishing(true);
    try {
      const metadata = deriveEssayMetadata(draft.content);
      await run(
        commands.createEssay({
          ...metadata,
          content: draft.content,
          tags: normalizeTags(draft.tags),
          status: 'published',
        }),
      );
      removeDraft(NEW_DRAFT_KEY);
      window.setTimeout(() => composerRef.current?.focus(), 0);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setIsPublishing(false);
    }
  };

  const saveEssay = async (essay: Essay) => {
    const draft = drafts[essay.id] ?? {content: essay.content, tags: essay.tags, updatedAt: essay.updatedAt};
    if (!draft.content.trim() || savingId) return;
    setActionError('');
    setSavingId(essay.id);
    try {
      const metadata = deriveEssayMetadata(draft.content);
      await run(commands.updateEssay({...metadata, id: essay.id, content: draft.content, tags: normalizeTags(draft.tags)}));
      removeDraft(essay.id);
      setEditingId(undefined);
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

  const cancelEditing = (essay: Essay) => {
    const draft = drafts[essay.id];
    if (draft && (draft.content !== essay.content || !sameTags(draft.tags, essay.tags))) {
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
        <section className={`task-main essay-main ${isTrash ? 'trash-view' : ''} ${actionError ? 'has-feedback' : ''}`} aria-label="随笔内容">
          <header className="task-module-header">
            <section>
              <span className="section-label">随笔</span>
              <h2>{currentTitle}</h2>
            </section>
            {!isTrash && (
              <button className="primary-btn task-add-record-btn" type="button" onClick={() => composerRef.current?.focus()}>
                <PencilLine aria-hidden="true" />
                写随笔
              </button>
            )}
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
            <section className="essay-composer-band" aria-label="快速记录">
              <VStack className="essay-content-column" gap={0}>
                <EssayComposer
                  draft={newDraft}
                  inputRef={composerRef}
                  isPublishing={isPublishing}
                  tagSource={tagSource}
                  onChange={(content, tags) => updateDraft(NEW_DRAFT_KEY, content, tags)}
                  onPublish={publishEssay}
                />
              </VStack>
            </section>
          )}
          <VStack className="essay-feed-scroll" gap={0}>
            <VStack className="essay-content-column" gap={3}>
              <EssayFeed
                drafts={drafts}
                editingId={editingId}
                essays={visibleEssays}
                filter={filter}
                restoringId={restoringId}
                savingId={savingId}
                tagSource={tagSource}
                onArchive={setPendingArchive}
                onCancelEdit={cancelEditing}
                onChangeDraft={updateDraft}
                onClearFilter={() => setFilter('all')}
                onEdit={setEditingId}
                onRestore={restoreEssay}
                onSave={saveEssay}
                onStartWriting={() => composerRef.current?.focus()}
                onTagClick={(tag) => setFilter(`tag:${tagKey(tag)}`)}
              />
            </VStack>
          </VStack>
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

function EssayComposer({
  draft,
  inputRef,
  isPublishing,
  tagSource,
  onChange,
  onPublish,
}: {
  draft: EssayDraft;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  isPublishing: boolean;
  tagSource: SearchSource<TagItem>;
  onChange: (content: string, tags: string[]) => void;
  onPublish: () => Promise<void>;
}) {
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(draft.tags.length > 0);
  useEffect(() => {
    if (!draft.content && draft.tags.length === 0) setIsTagPickerOpen(false);
  }, [draft.content, draft.tags.length]);
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void onPublish();
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      void onPublish();
    }
  };

  return (
    <form className="essay-composer" onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
      <VStack gap={3}>
        <TextArea
          ref={inputRef}
          label="记录随笔"
          isLabelHidden
          value={draft.content}
          placeholder="现在的想法是..."
          rows={5}
          width="100%"
          hasAutoFocus
          isDisabled={isPublishing}
          onChange={(content) => onChange(content, draft.tags)}
        />
        {isTagPickerOpen && <EssayTagPicker tags={draft.tags} tagSource={tagSource} onChange={(tags) => onChange(draft.content, tags)} />}
        <HStack className="essay-composer-footer" gap={2} hAlign="between" vAlign="center">
          <HStack gap={1} vAlign="center">
            <IconButton
              label={isTagPickerOpen ? '收起标签' : '添加标签'}
              tooltip={isTagPickerOpen ? '收起标签' : '添加标签'}
              icon={<Hash aria-hidden="true" />}
              variant={isTagPickerOpen ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setIsTagPickerOpen((value) => !value)}
            />
            {draft.tags.length > 0 && <span className="essay-selected-tag-count">{draft.tags.length} 个标签</span>}
          </HStack>
          <IconButton
            label="发布随笔"
            tooltip="发布随笔"
            icon={<Send aria-hidden="true" />}
            variant="primary"
            isLoading={isPublishing}
            isDisabled={!draft.content.trim()}
            onClick={() => void onPublish()}
          />
        </HStack>
      </VStack>
    </form>
  );
}

function EssayTagPicker({
  tags,
  tagSource,
  onChange,
}: {
  tags: string[];
  tagSource: SearchSource<TagItem>;
  onChange: (tags: string[]) => void;
}) {
  return (
    <Tokenizer<TagItem>
      label="标签"
      value={tagItems(tags)}
      searchSource={tagSource}
      placeholder="搜索或创建标签"
      emptySearchResultsText="输入后创建新标签"
      hasEntriesOnFocus
      hasCreate
      size="sm"
      debounceMs={0}
      renderItem={(item) => (
        <span>{item.id.startsWith('__xds_create__') ? `创建「${item.id.slice('__xds_create__'.length)}」` : item.label}</span>
      )}
      onChange={(items) => onChange(normalizeTags(items.map((item) => item.label)))}
    />
  );
}

function EssayFeed({
  drafts,
  editingId,
  essays,
  filter,
  restoringId,
  savingId,
  tagSource,
  onArchive,
  onCancelEdit,
  onChangeDraft,
  onClearFilter,
  onEdit,
  onRestore,
  onSave,
  onStartWriting,
  onTagClick,
}: {
  drafts: Record<string, EssayDraft>;
  editingId?: string;
  essays: Essay[];
  filter: EssayFilter;
  restoringId?: string;
  savingId?: string;
  tagSource: SearchSource<TagItem>;
  onArchive: (essay: Essay) => void;
  onCancelEdit: (essay: Essay) => void;
  onChangeDraft: (key: string, content: string, tags: string[]) => void;
  onClearFilter: () => void;
  onEdit: (id: string) => void;
  onRestore: (essay: Essay) => Promise<void>;
  onSave: (essay: Essay) => Promise<void>;
  onStartWriting: () => void;
  onTagClick: (tag: string) => void;
}) {
  if (!essays.length) {
    const isTrash = filter === 'trash';
    const isFiltered = filter.startsWith('tag:');
    return (
      <EmptyState
        headingLevel={2}
        icon={isTrash ? <Trash2 /> : isFiltered ? <Tags /> : <Inbox />}
        title={isTrash ? '回收站为空' : isFiltered ? '该标签下没有随笔' : '还没有随笔'}
        description={isTrash ? '已删除的随笔会出现在这里，并且可以随时恢复。' : isFiltered ? '可以切换标签，或回到全部随笔。' : '从上方输入框记录第一个想法。'}
        actions={
          isFiltered ? (
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
        const draft = drafts[essay.id] ?? {content: essay.content, tags: essay.tags, updatedAt: essay.updatedAt};
        return (
          <article className="essay-feed-item" key={essay.id}>
            {isEditing ? (
              <VStack className="essay-inline-editor" gap={3}>
                <TextArea
                  label="编辑随笔"
                  value={draft.content}
                  rows={8}
                  width="100%"
                  hasAutoFocus
                  isDisabled={savingId === essay.id}
                  onChange={(content) => onChangeDraft(essay.id, content, draft.tags)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && event.ctrlKey) {
                      event.preventDefault();
                      void onSave(essay);
                    }
                  }}
                />
                <EssayTagPicker
                  tags={draft.tags}
                  tagSource={tagSource}
                  onChange={(tags) => onChangeDraft(essay.id, draft.content, tags)}
                />
                <HStack gap={2} hAlign="end">
                  <Button label="取消编辑" icon={<X aria-hidden="true" />} variant="ghost" onClick={() => onCancelEdit(essay)} />
                  <Button
                    label="保存随笔"
                    icon={<Save aria-hidden="true" />}
                    variant="primary"
                    isLoading={savingId === essay.id}
                    isDisabled={!draft.content.trim()}
                    onClick={() => void onSave(essay)}
                  />
                </HStack>
              </VStack>
            ) : (
              <VStack gap={3}>
                <HStack className="essay-feed-item-header" gap={2} hAlign="between" vAlign="center">
                  <Timestamp value={essay.createdAt} format="date_time" hasTooltip={false} />
                  {filter === 'trash' ? (
                    <Button
                      label="恢复"
                      icon={<RotateCcw aria-hidden="true" />}
                      size="sm"
                      variant="ghost"
                      isLoading={restoringId === essay.id}
                      onClick={() => void onRestore(essay)}
                    />
                  ) : (
                    <MoreMenu
                      label="随笔操作"
                      size="sm"
                      isDisabled={Boolean(savingId)}
                      items={[
                        {label: '编辑', icon: <PencilLine aria-hidden="true" />, onClick: () => onEdit(essay.id)},
                        {label: '删除', icon: <Trash2 aria-hidden="true" />, onClick: () => onArchive(essay)},
                      ]}
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
                <Markdown className="essay-feed-markdown" density="compact" headingLevelStart={3} contentWidth="100%" autolink="gfm">
                  {essay.content}
                </Markdown>
              </VStack>
            )}
          </article>
        );
      })}
    </VStack>
  );
}
