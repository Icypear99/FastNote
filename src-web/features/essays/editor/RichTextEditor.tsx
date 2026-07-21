import {useEffect, useMemo, useRef, useState} from 'react';
import type {Editor} from '@tiptap/core';
import {EditorContent, useEditor} from '@tiptap/react';
import {splitBlock} from '@tiptap/pm/commands';
import {splitListItem} from '@tiptap/pm/schema-list';
import {canSplit} from '@tiptap/pm/transform';
import {
  AtSign,
  Bold,
  Camera,
  ChevronLeft,
  ChevronRight,
  Hash,
  Highlighter,
  ImagePlus,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  Send,
  Type,
  Underline,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Popover} from '@astryxdesign/core/Popover';
import {VStack} from '@astryxdesign/core/VStack';
import type {Essay, EssayAttachment} from '../../../shared/types';
import {
  collectDocumentTags,
  editorExtensions,
  parseEditorDocument,
  richTextHtml,
  stripDocumentTags,
  type RichTextValue,
} from './editorDocument';
import {normalizeTags, tagKey} from '../../../shared/utils/essay';

interface EditorSourceValue {
  content: string;
  contentFormat: 'markdown' | 'tiptap-json';
  contentJson: string;
  tags: string[];
}

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function isolateCurrentSoftBreakLine(editor: Editor) {
  const {state, view} = editor;
  const {$from} = state.selection;
  if (!state.selection.empty || !$from.parent.isTextblock) return;

  const parentStart = $from.start();
  const breakPositions: number[] = [];
  $from.parent.forEach((node, offset) => {
    if (node.type.name === 'hardBreak') breakPositions.push(parentStart + offset);
  });

  const previousBreak = breakPositions.filter((position) => position < $from.pos).at(-1);
  const nextBreak = breakPositions.find((position) => position >= $from.pos);
  let transaction = state.tr;
  [nextBreak, previousBreak].forEach((position) => {
    if (position === undefined || !canSplit(transaction.doc, position)) return;
    transaction = transaction.delete(position, position + 1).split(position);
  });

  if (transaction.docChanged) view.dispatch(transaction);
}

export function RichTextEditor({
  value,
  knownTags,
  referenceEssays,
  attachments,
  isDisabled = false,
  isSubmitting = false,
  submitLabel = '发布随笔',
  placeholder = '现在的想法是...',
  onChange,
  onAddImages,
  onRemoveAttachment,
  onSubmit,
  onError,
}: {
  value: EditorSourceValue;
  knownTags: string[];
  referenceEssays: Essay[];
  attachments: EssayAttachment[];
  isDisabled?: boolean;
  isSubmitting?: boolean;
  submitLabel?: string;
  placeholder?: string;
  onChange: (value: RichTextValue) => void;
  onAddImages: (files: File[]) => Promise<void>;
  onRemoveAttachment: (id: string) => void;
  onSubmit?: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const tagsRef = useRef(knownTags);
  const selectedTagsRef = useRef(normalizeTags(value.tags));
  const submitRef = useRef(onSubmit);
  const canSubmitRef = useRef(Boolean(value.content.trim() || attachments.length));
  const isDisabledRef = useRef(isDisabled);
  const isSubmittingRef = useRef(isSubmitting);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const externalKeyRef = useRef('');
  const [isImporting, setIsImporting] = useState(false);
  const [, setEditorVersion] = useState(0);
  tagsRef.current = knownTags;
  submitRef.current = onSubmit;
  canSubmitRef.current = Boolean(value.content.trim() || attachments.length);
  isDisabledRef.current = isDisabled;
  isSubmittingRef.current = isSubmitting;

  const initialDocument = useMemo(
    () => parseEditorDocument(value.content, value.contentFormat, value.contentJson),
    // The editor owns changes after mount; external synchronization is handled below.
    [],
  );
  const extensions = useMemo(
    () => editorExtensions(
      () => tagsRef.current,
      placeholder,
      (tag) => {
        selectedTagsRef.current = normalizeTags([...selectedTagsRef.current, tag]);
      },
    ),
    [placeholder],
  );
  const editor = useEditor({
    extensions,
    content: initialDocument,
    editable: !isDisabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'essay-tiptap-editor',
        'aria-label': '随笔正文',
      },
      handleKeyDown: (view, event) => {
        if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return false;
        if (document.querySelector('.essay-tag-suggestion')) return false;
        event.preventDefault();
        if (event.shiftKey) {
          const listItem = view.state.schema.nodes.listItem;
          return (listItem && splitListItem(listItem)(view.state, view.dispatch)) || splitBlock(view.state, view.dispatch);
        }
        if (!isDisabledRef.current && !isSubmittingRef.current && canSubmitRef.current) {
          void submitRef.current?.();
        }
        return true;
      },
    },
    onUpdate: ({editor: currentEditor}) => {
      const editorDocument = currentEditor.getJSON();
      const document = stripDocumentTags(editorDocument);
      const content = currentEditor.getText({blockSeparator: '\n'});
      canSubmitRef.current = Boolean(content.trim() || attachments.length);
      const next: RichTextValue = {
        content,
        contentFormat: 'tiptap-json',
        contentJson: JSON.stringify(document),
        tags: normalizeTags([...selectedTagsRef.current, ...collectDocumentTags(editorDocument)]),
      };
      externalKeyRef.current = next.contentJson;
      onChange(next);
    },
    onTransaction: () => setEditorVersion((version) => version + 1),
  });

  useEffect(() => {
    editor?.setEditable(!isDisabled);
  }, [editor, isDisabled]);

  useEffect(() => {
    selectedTagsRef.current = normalizeTags(value.tags);
  }, [value.tags]);

  useEffect(() => {
    if (!editor) return;
    const externalKey = value.contentJson || `${value.contentFormat}:${value.content}`;
    if (externalKeyRef.current === externalKey) return;
    const document = parseEditorDocument(value.content, value.contentFormat, value.contentJson);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(document)) {
      editor.commands.setContent(document, {emitUpdate: false});
    }
    externalKeyRef.current = externalKey;
  }, [editor, value.content, value.contentFormat, value.contentJson]);

  const importImages = async (files: File[]) => {
    if (!files.length || isImporting) return;
    const images = files.filter((file) => SUPPORTED_IMAGE_TYPES.has(file.type));
    if (images.length !== files.length) {
      onError('仅支持 JPG、PNG、GIF 和 WebP 图片。');
      return;
    }
    if (images.some((file) => file.size > MAX_IMAGE_BYTES)) {
      onError('单张图片不能超过 10 MB。');
      return;
    }
    setIsImporting(true);
    try {
      await onAddImages(images);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImporting(false);
    }
  };

  const pasteScreenshot = async () => {
    if (!navigator.clipboard?.read) {
      onError('当前环境不支持读取剪贴板，请直接按 Ctrl+V 粘贴截图。');
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      const screenshots: File[] = [];
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        const extension = imageType.split('/')[1] || 'png';
        screenshots.push(new File([blob], `screenshot-${Date.now()}.${extension}`, {type: imageType}));
      }
      if (!screenshots.length) {
        onError('剪贴板中没有截图。');
        return;
      }
      await importImages(screenshots);
    } catch {
      onError('无法读取剪贴板，请直接按 Ctrl+V 粘贴截图。');
    }
  };

  const insertReference = (essay: Essay) => {
    editor
      ?.chain()
      .focus()
      .insertContent([
        {type: 'memoReference', attrs: {id: essay.id, label: essay.title || '笔记'}},
        {type: 'text', text: ' '},
      ])
      .run();
  };

  const canSubmit = Boolean(value.content.trim() || attachments.length);

  const toggleList = (type: 'bulletList' | 'orderedList') => {
    if (!editor) return;
    isolateCurrentSoftBreakLine(editor);
    const chain = editor.chain().focus();
    if (type === 'bulletList') chain.toggleBulletList().run();
    else chain.toggleOrderedList().run();
  };

  const removeSelectedTag = (tag: string) => {
    if (!editor) return;
    const tags = selectedTagsRef.current.filter((item) => tagKey(item) !== tagKey(tag));
    selectedTagsRef.current = tags;
    const document = stripDocumentTags(editor.getJSON());
    const next: RichTextValue = {
      content: editor.getText({blockSeparator: '\n'}),
      contentFormat: 'tiptap-json',
      contentJson: JSON.stringify(document),
      tags,
    };
    externalKeyRef.current = next.contentJson;
    onChange(next);
  };

  return (
    <section className={`essay-rich-editor ${editor?.isFocused ? 'is-focused' : ''} ${isDisabled ? 'is-disabled' : ''}`}>
      <EditorContent
        editor={editor}
        onPasteCapture={(event) => {
          const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
          if (!images.length) return;
          event.preventDefault();
          void importImages(images);
        }}
      />

      {value.tags.length > 0 && (
        <HStack className="essay-editor-selected-tags" gap={1} wrap="wrap" aria-label="已选标签">
          {normalizeTags(value.tags).map((tag) => (
            <button key={tagKey(tag)} type="button" aria-label={`移除标签 ${tag}`} onClick={() => removeSelectedTag(tag)}>
              <span>#{tag}</span>
              <X aria-hidden="true" />
            </button>
          ))}
        </HStack>
      )}

      <AttachmentTray attachments={attachments} isEditable={!isDisabled} onRemove={onRemoveAttachment} />

      <HStack as="nav" className="essay-editor-toolbar" gap={1} hAlign="between" vAlign="center" aria-label="随笔格式工具">
        <HStack className="essay-editor-tools" gap={1} vAlign="center" wrap="wrap">
          <IconButton
            label="插入标签"
            tooltip="插入标签"
            icon={<Hash aria-hidden="true" />}
            size="sm"
            variant="ghost"
            isDisabled={isDisabled}
            onClick={() => editor?.chain().focus().insertContent('#').run()}
          />
          <IconButton
            label="添加图片"
            tooltip="添加图片"
            icon={<ImagePlus aria-hidden="true" />}
            size="sm"
            variant="ghost"
            isDisabled={isDisabled || isImporting}
            onClick={() => fileInputRef.current?.click()}
          />
          <IconButton
            label="粘贴截图"
            tooltip="粘贴剪贴板截图"
            icon={<Camera aria-hidden="true" />}
            size="sm"
            variant="ghost"
            isDisabled={isDisabled || isImporting}
            onClick={() => void pasteScreenshot()}
          />
          <input
            ref={fileInputRef}
            className="essay-file-input"
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            onChange={(event) => {
              void importImages(Array.from(event.currentTarget.files || []));
              event.currentTarget.value = '';
            }}
          />
          <span className="essay-toolbar-divider" aria-hidden="true" />
          <Popover
            label="文字格式"
            placement="above"
            alignment="start"
            hasAutoFocus={false}
            content={
              <HStack className="essay-format-menu" gap={1} vAlign="center">
                <IconButton
                  label="加粗"
                  tooltip="加粗"
                  icon={<Bold aria-hidden="true" />}
                  size="sm"
                  variant={editor?.isActive('bold') ? 'secondary' : 'ghost'}
                  onClick={() => editor?.chain().focus().toggleBold().run()}
                />
                <IconButton
                  label="下划线"
                  tooltip="下划线"
                  icon={<Underline aria-hidden="true" />}
                  size="sm"
                  variant={editor?.isActive('underline') ? 'secondary' : 'ghost'}
                  onClick={() => editor?.chain().focus().toggleUnderline().run()}
                />
                <IconButton
                  label="高亮"
                  tooltip="高亮"
                  icon={<Highlighter aria-hidden="true" />}
                  size="sm"
                  variant={editor?.isActive('highlight') ? 'secondary' : 'ghost'}
                  onClick={() => editor?.chain().focus().toggleHighlight().run()}
                />
              </HStack>
            }
          >
            <IconButton
              label="文字格式"
              tooltip="文字格式"
              icon={<Type aria-hidden="true" />}
              size="sm"
              variant="ghost"
              isDisabled={isDisabled}
            />
          </Popover>
          <IconButton
            label="无序列表"
            tooltip="无序列表"
            icon={<List aria-hidden="true" />}
            size="sm"
            variant={editor?.isActive('bulletList') ? 'secondary' : 'ghost'}
            isDisabled={isDisabled}
            onClick={() => toggleList('bulletList')}
          />
          <IconButton
            label="有序列表"
            tooltip="有序列表"
            icon={<ListOrdered aria-hidden="true" />}
            size="sm"
            variant={editor?.isActive('orderedList') ? 'secondary' : 'ghost'}
            isDisabled={isDisabled}
            onClick={() => toggleList('orderedList')}
          />
          <span className="essay-toolbar-divider" aria-hidden="true" />
          <Popover
            label="引用笔记"
            placement="above"
            alignment="start"
            content={
              <VStack className="essay-reference-menu" gap={1}>
                {referenceEssays.length ? (
                  referenceEssays.slice(0, 6).map((essay) => (
                    <Button key={essay.id} label={essay.title || '未命名笔记'} variant="ghost" size="sm" onClick={() => insertReference(essay)} />
                  ))
                ) : (
                  <span className="essay-reference-empty">暂无可引用笔记</span>
                )}
              </VStack>
            }
          >
            <IconButton
              label="引用笔记"
              tooltip="引用笔记"
              icon={<AtSign aria-hidden="true" />}
              size="sm"
              variant="ghost"
              isDisabled={isDisabled}
            />
          </Popover>
        </HStack>
        {onSubmit && (
          <span className="essay-submit-action">
            <IconButton
              label={submitLabel}
              tooltip="发送保存 Enter · 换行 Shift+Enter"
              icon={<Send aria-hidden="true" />}
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
              isDisabled={!canSubmit || isDisabled}
              onClick={() => void onSubmit()}
            />
          </span>
        )}
      </HStack>
    </section>
  );
}

export function RichTextViewer({essay}: {essay: Essay}) {
  const html = useMemo(
    () => (essay.contentFormat === 'tiptap-json' && essay.contentJson ? richTextHtml(essay.contentJson) : ''),
    [essay.contentFormat, essay.contentJson],
  );
  if (!html) return null;
  return <section className="essay-rich-content" dangerouslySetInnerHTML={{__html: html}} />;
}

export function AttachmentTray({
  attachments,
  isEditable,
  onRemove,
}: {
  attachments: EssayAttachment[];
  isEditable: boolean;
  onRemove: (id: string) => void;
}) {
  const [previewIndex, setPreviewIndex] = useState<number>();
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({x: 0, y: 0});
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const lightboxRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{pointerId: number; startX: number; startY: number; originX: number; originY: number} | undefined>(undefined);
  const preview = previewIndex === undefined ? undefined : attachments[previewIndex];

  const resetTransform = () => {
    setScale(1);
    setRotation(0);
    setPan({x: 0, y: 0});
  };

  const closePreview = () => {
    if (document.fullscreenElement === lightboxRef.current) void document.exitFullscreen();
    setPreviewIndex(undefined);
  };

  const changePreview = (direction: -1 | 1) => {
    setPreviewIndex((current) => {
      if (current === undefined || attachments.length < 2) return current;
      return (current + direction + attachments.length) % attachments.length;
    });
  };

  const changeScale = (delta: number) => {
    setScale((current) => {
      const next = Math.min(4, Math.max(0.5, Number((current + delta).toFixed(2))));
      if (next <= 1) setPan({x: 0, y: 0});
      return next;
    });
  };

  const rotate = (degrees: -90 | 90) => {
    setRotation((current) => (current + degrees + 360) % 360);
    setPan({x: 0, y: 0});
  };

  const toggleFullscreen = async () => {
    if (!lightboxRef.current) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await lightboxRef.current.requestFullscreen();
    } catch {
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    if (previewIndex === undefined) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePreview();
      if (event.key === 'ArrowLeft') changePreview(-1);
      if (event.key === 'ArrowRight') changePreview(1);
      if (event.key === '+' || event.key === '=') changeScale(0.25);
      if (event.key === '-') changeScale(-0.25);
      if (event.key === '0') resetTransform();
      if (event.key.toLowerCase() === 'r') rotate(event.shiftKey ? -90 : 90);
    };
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === lightboxRef.current);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [previewIndex, attachments.length]);

  useEffect(() => {
    resetTransform();
  }, [previewIndex]);

  useEffect(() => {
    setPreviewIndex((current) => {
      if (current === undefined || current < attachments.length) return current;
      return attachments.length ? attachments.length - 1 : undefined;
    });
  }, [attachments.length]);

  if (!attachments.length) return null;
  return (
    <>
      <ul className="essay-attachment-grid" aria-label="图片附件">
        {attachments.map((attachment, index) => (
          <li className="essay-attachment-item" key={attachment.id}>
            <button
              className="essay-attachment-preview"
              type="button"
              aria-label={`预览 ${attachment.fileName}`}
              onClick={() => setPreviewIndex(index)}
            >
              <img src={attachment.previewDataUrl} alt={attachment.fileName} loading="lazy" />
            </button>
            {isEditable && (
              <span className="essay-attachment-remove">
                <IconButton
                  label={`移除 ${attachment.fileName}`}
                  tooltip="移除图片"
                  icon={<X aria-hidden="true" />}
                  size="sm"
                  variant="secondary"
                  onClick={() => onRemove(attachment.id)}
                />
              </span>
            )}
          </li>
        ))}
      </ul>
      {preview && (
        <section
          ref={lightboxRef}
          className="essay-image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`图片预览：${preview.fileName}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePreview();
          }}
        >
          <button className="essay-image-lightbox-close" type="button" title="关闭" aria-label="关闭图片预览" onClick={closePreview}>
            <X aria-hidden="true" />
          </button>

          {attachments.length > 1 && (
            <>
              <button className="essay-image-lightbox-page previous" type="button" title="上一张" aria-label="上一张图片" onClick={() => changePreview(-1)}>
                <ChevronLeft aria-hidden="true" />
              </button>
              <button className="essay-image-lightbox-page next" type="button" title="下一张" aria-label="下一张图片" onClick={() => changePreview(1)}>
                <ChevronRight aria-hidden="true" />
              </button>
            </>
          )}

          <div
            className={`essay-image-lightbox-stage ${scale > 1 ? 'is-zoomed' : ''} ${isDragging ? 'is-dragging' : ''}`}
            onWheel={(event) => {
              event.preventDefault();
              changeScale(event.deltaY < 0 ? 0.25 : -0.25);
            }}
            onDoubleClick={() => {
              if (scale === 1) setScale(2);
              else resetTransform();
            }}
            onPointerDown={(event) => {
              if (scale <= 1) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              dragRef.current = {pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y};
              setIsDragging(true);
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              setPan({x: drag.originX + event.clientX - drag.startX, y: drag.originY + event.clientY - drag.startY});
            }}
            onPointerUp={(event) => {
              if (dragRef.current?.pointerId !== event.pointerId) return;
              dragRef.current = undefined;
              setIsDragging(false);
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              dragRef.current = undefined;
              setIsDragging(false);
            }}
          >
            <img
              src={preview.previewDataUrl}
              alt={preview.fileName}
              draggable={false}
              style={{transform: `translate3d(${pan.x}px, ${pan.y}px, 0) rotate(${rotation}deg) scale(${scale})`}}
            />
          </div>

          <nav className="essay-image-lightbox-toolbar" aria-label="图片预览工具">
            <button type="button" title="缩小" aria-label="缩小图片" disabled={scale <= 0.5} onClick={() => changeScale(-0.25)}>
              <ZoomOut aria-hidden="true" />
            </button>
            <button type="button" title="放大" aria-label="放大图片" disabled={scale >= 4} onClick={() => changeScale(0.25)}>
              <ZoomIn aria-hidden="true" />
            </button>
            <button type="button" title={isFullscreen ? '退出全屏' : '全屏'} aria-label={isFullscreen ? '退出全屏预览' : '全屏预览'} onClick={() => void toggleFullscreen()}>
              {isFullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
            </button>
            <button type="button" title="向左旋转" aria-label="图片向左旋转" onClick={() => rotate(-90)}>
              <RotateCcw aria-hidden="true" />
            </button>
            <button type="button" title="向右旋转" aria-label="图片向右旋转" onClick={() => rotate(90)}>
              <RotateCw aria-hidden="true" />
            </button>
          </nav>
        </section>
      )}
    </>
  );
}
