import {Node, type JSONContent} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Suggestion, {type SuggestionProps} from '@tiptap/suggestion';
import DOMPurify from 'dompurify';
import {generateHTML} from '@tiptap/core';
import {normalizeTag, normalizeTags, tagKey} from '../../../shared/utils/essay';

export interface RichTextValue {
  content: string;
  contentFormat: 'tiptap-json';
  contentJson: string;
  tags: string[];
}

interface TagSuggestionItem {
  label: string;
  isNew?: boolean;
}

interface ReferenceAttributes {
  id: string;
  label: string;
}

function tagSuggestionRenderer() {
  let props: SuggestionProps<TagSuggestionItem, TagSuggestionItem> | undefined;
  let root: HTMLElement | undefined;
  let unmount: (() => void) | undefined;
  let selectedIndex = 0;

  const render = () => {
    if (!root || !props) return;
    root.replaceChildren();
    root.setAttribute('role', 'listbox');
    root.setAttribute('aria-label', '标签建议');
    const items = props.items;
    if (!items.length) {
      const empty = document.createElement('span');
      empty.className = 'essay-tag-suggestion-empty';
      empty.textContent = '输入标签名称';
      root.append(empty);
      return;
    }
    selectedIndex = Math.min(selectedIndex, items.length - 1);
    items.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'essay-tag-suggestion-item';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === selectedIndex));
      button.textContent = item.isNew ? `创建 #${item.label}` : `#${item.label}`;
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        props?.command(item);
      });
      root?.append(button);
    });
  };

  return {
    onStart(nextProps: SuggestionProps<TagSuggestionItem, TagSuggestionItem>) {
      props = nextProps;
      selectedIndex = 0;
      root = document.createElement('section');
      root.className = 'essay-tag-suggestion';
      unmount = nextProps.mount(root);
      render();
    },
    onUpdate(nextProps: SuggestionProps<TagSuggestionItem, TagSuggestionItem>) {
      props = nextProps;
      selectedIndex = 0;
      render();
    },
    onKeyDown({event}: {event: KeyboardEvent}) {
      if (!props?.items.length) return false;
      if (event.key === 'ArrowDown') {
        selectedIndex = (selectedIndex + 1) % props.items.length;
        render();
        return true;
      }
      if (event.key === 'ArrowUp') {
        selectedIndex = (selectedIndex + props.items.length - 1) % props.items.length;
        render();
        return true;
      }
      if (event.key === 'Enter') {
        props.command(props.items[selectedIndex]);
        return true;
      }
      return false;
    },
    onExit() {
      unmount?.();
      root = undefined;
      props = undefined;
      unmount = undefined;
    },
  };
}

export function createTagExtension(getTags: () => string[], enableSuggestion = true) {
  return Node.create({
    name: 'tag',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: false,
    addAttributes() {
      return {label: {default: ''}};
    },
    parseHTML() {
      return [{tag: 'span[data-essay-tag]'}];
    },
    renderHTML({node}) {
      const label = normalizeTag(String(node.attrs.label || ''));
      return ['span', {'data-essay-tag': label, class: 'essay-inline-tag'}, `#${label}`];
    },
    addProseMirrorPlugins() {
      if (!enableSuggestion) return [];
      return [
        Suggestion<TagSuggestionItem, TagSuggestionItem>({
          editor: this.editor,
          char: '#',
          allowSpaces: false,
          decorationClass: 'essay-tag-query',
          items: ({query}) => {
            const normalizedQuery = tagKey(query);
            const existing: TagSuggestionItem[] = normalizeTags(getTags())
              .filter((tag) => !normalizedQuery || tagKey(tag).includes(normalizedQuery))
              .slice(0, 7)
              .map((label) => ({label}));
            const candidate = normalizeTag(query);
            if (candidate && !existing.some((item) => tagKey(item.label) === tagKey(candidate))) {
              existing.push({label: candidate, isNew: true});
            }
            return existing;
          },
          command: ({editor, range, props: item}) => {
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                {type: 'tag', attrs: {label: item.label}},
                {type: 'text', text: ' '},
              ])
              .run();
          },
          render: tagSuggestionRenderer,
        }),
      ];
    },
  });
}

export const MemoReference = Node.create({
  name: 'memoReference',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  addAttributes() {
    return {
      id: {default: ''},
      label: {default: '笔记'},
    };
  },
  parseHTML() {
    return [{tag: 'span[data-memo-reference]'}];
  },
  renderHTML({node}) {
    const attrs = node.attrs as ReferenceAttributes;
    return [
      'span',
      {'data-memo-reference': attrs.id, class: 'essay-inline-reference'},
      `@${attrs.label}`,
    ];
  },
});

export function editorExtensions(getTags: () => string[], placeholder = '现在的想法是...') {
  return [
    StarterKit.configure({
      heading: {levels: [1, 2, 3]},
      link: {openOnClick: false, autolink: true},
    }),
    Highlight.configure({multicolor: false}),
    Underline,
    Placeholder.configure({placeholder}),
    createTagExtension(getTags),
    MemoReference,
  ];
}

export function viewerExtensions() {
  return [
    StarterKit.configure({heading: {levels: [1, 2, 3]}}),
    Highlight.configure({multicolor: false}),
    Underline,
    createTagExtension(() => [], false),
    MemoReference,
  ];
}

function paragraph(text: string): JSONContent {
  return {type: 'paragraph', content: text ? [{type: 'text', text}] : undefined};
}

export function legacyMarkdownToDocument(markdown: string): JSONContent {
  const content: JSONContent[] = [];
  const lines = markdown.replace(/\r/g, '').split('\n');
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      content.push({type: 'heading', attrs: {level: heading[1].length}, content: [{type: 'text', text: heading[2]}]});
      index += 1;
      continue;
    }
    const bullet = line.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      const items: JSONContent[] = [];
      while (index < lines.length) {
        const match = lines[index].match(/^[-*+]\s+(.+)$/);
        if (!match) break;
        items.push({type: 'listItem', content: [paragraph(match[1])]});
        index += 1;
      }
      content.push({type: 'bulletList', content: items});
      continue;
    }
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      const items: JSONContent[] = [];
      while (index < lines.length) {
        const match = lines[index].match(/^\d+[.)]\s+(.+)$/);
        if (!match) break;
        items.push({type: 'listItem', content: [paragraph(match[1])]});
        index += 1;
      }
      content.push({type: 'orderedList', content: items});
      continue;
    }
    content.push(paragraph(line));
    index += 1;
  }
  return {type: 'doc', content: content.length ? content : [paragraph('')]};
}

export function parseEditorDocument(content: string, contentFormat: string, contentJson: string): JSONContent {
  if (contentFormat === 'tiptap-json' && contentJson) {
    try {
      return JSON.parse(contentJson) as JSONContent;
    } catch {
      return legacyMarkdownToDocument(content);
    }
  }
  return legacyMarkdownToDocument(content);
}

export function collectDocumentTags(document: JSONContent, plainText: string) {
  const tags: string[] = [];
  const visit = (node: JSONContent) => {
    if (node.type === 'tag' && node.attrs?.label) tags.push(String(node.attrs.label));
    node.content?.forEach(visit);
  };
  visit(document);
  for (const match of plainText.matchAll(/(?:^|\s)#([^\s#]+)/gu)) tags.push(match[1]);
  return normalizeTags(tags);
}

export function richTextHtml(contentJson: string) {
  try {
    const html = generateHTML(JSON.parse(contentJson) as JSONContent, viewerExtensions());
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'mark', 's', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'a', 'span', 'hr'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'data-essay-tag', 'data-memo-reference'],
    });
  } catch {
    return '';
  }
}
