import {useEffect, useMemo, useRef, useState} from 'react';
import {EditorContent, useEditor} from '@tiptap/react';
import {
  AtSign,
  Bold,
  Camera,
  Hash,
  Highlighter,
  ImagePlus,
  List,
  ListOrdered,
  Send,
  Type,
  Underline,
  X,
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
  type RichTextValue,
} from './editorDocument';

interface EditorSourceValue {
  content: string;
  contentFormat: 'markdown' | 'tiptap-json';
  contentJson: string;
}

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const externalKeyRef = useRef('');
  const [isImporting, setIsImporting] = useState(false);
  const [, setEditorVersion] = useState(0);
  tagsRef.current = knownTags;

  const initialDocument = useMemo(
    () => parseEditorDocument(value.content, value.contentFormat, value.contentJson),
    // The editor owns changes after mount; external synchronization is handled below.
    [],
  );
  const extensions = useMemo(() => editorExtensions(() => tagsRef.current, placeholder), [placeholder]);
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
    },
    onUpdate: ({editor: currentEditor}) => {
      const document = currentEditor.getJSON();
      const content = currentEditor.getText({blockSeparator: '\n'});
      const next: RichTextValue = {
        content,
        contentFormat: 'tiptap-json',
        contentJson: JSON.stringify(document),
        tags: collectDocumentTags(document, content),
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
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          />
          <IconButton
            label="有序列表"
            tooltip="有序列表"
            icon={<ListOrdered aria-hidden="true" />}
            size="sm"
            variant={editor?.isActive('orderedList') ? 'secondary' : 'ghost'}
            isDisabled={isDisabled}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
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
          <IconButton
            label={submitLabel}
            tooltip={submitLabel}
            icon={<Send aria-hidden="true" />}
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
            isDisabled={!canSubmit || isDisabled}
            onClick={() => void onSubmit()}
          />
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
  const [preview, setPreview] = useState<EssayAttachment>();
  useEffect(() => {
    if (!preview) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreview(undefined);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [preview]);
  if (!attachments.length) return null;
  return (
    <>
      <ul className="essay-attachment-grid" aria-label="图片附件">
        {attachments.map((attachment) => (
          <li className="essay-attachment-item" key={attachment.id}>
            <button
              className="essay-attachment-preview"
              type="button"
              aria-label={`预览 ${attachment.fileName}`}
              onClick={() => setPreview(attachment)}
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
        <section className="essay-image-lightbox" role="dialog" aria-modal="true" aria-label={preview.fileName}>
          <span className="essay-image-lightbox-close">
            <IconButton
              label="关闭图片预览"
              tooltip="关闭"
              icon={<X aria-hidden="true" />}
              variant="secondary"
              onClick={() => setPreview(undefined)}
            />
          </span>
          <img src={preview.previewDataUrl} alt={preview.fileName} />
        </section>
      )}
    </>
  );
}
