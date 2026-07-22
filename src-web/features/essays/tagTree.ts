import type {Essay} from '../../shared/types';
import {normalizeTags, tagAncestors, tagKey} from '../../shared/utils/essay';

export const TAG_PREFERENCES_STORAGE_KEY = 'fastnote:essays:tag-preferences:v1';
export const ROOT_TAG_KEY = '__root__';

export interface TagPreferences {
  expandedKeys: string[];
  icons: Record<string, string>;
  orderByParent: Record<string, string[]>;
}

export interface TagNode {
  key: string;
  label: string;
  name: string;
  parentKey: string;
  count: number;
  children: TagNode[];
}

export interface TagTreeResult {
  nodes: TagNode[];
  flatNodes: TagNode[];
  knownTags: string[];
}

export const EMPTY_TAG_PREFERENCES: TagPreferences = {
  expandedKeys: [],
  icons: {},
  orderByParent: {},
};

export function readTagPreferences(): TagPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(TAG_PREFERENCES_STORAGE_KEY) || '{}') as Partial<TagPreferences>;
    return {
      expandedKeys: Array.isArray(value.expandedKeys) ? value.expandedKeys.filter((key): key is string => typeof key === 'string') : [],
      icons: value.icons && typeof value.icons === 'object' ? value.icons : {},
      orderByParent: value.orderByParent && typeof value.orderByParent === 'object' ? value.orderByParent : {},
    };
  } catch {
    return EMPTY_TAG_PREFERENCES;
  }
}

export function writeTagPreferences(preferences: TagPreferences) {
  try {
    localStorage.setItem(TAG_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // 存储空间不可用时保留当前会话状态，不影响标签筛选。
  }
}

function compareTagNodes(left: TagNode, right: TagNode, order: string[]) {
  const leftIndex = order.indexOf(left.key);
  const rightIndex = order.indexOf(right.key);
  if (leftIndex >= 0 || rightIndex >= 0) {
    if (leftIndex < 0) return 1;
    if (rightIndex < 0) return -1;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  }
  return left.name.localeCompare(right.name, 'zh-CN');
}

export function buildTagTree(essays: Essay[], orderByParent: Record<string, string[]>): TagTreeResult {
  const nodesByKey = new Map<string, TagNode>();
  const essayIdsByKey = new Map<string, Set<string>>();
  const knownTags = new Map<string, string>();

  essays.forEach((essay) => {
    const essayPaths = new Set<string>();
    normalizeTags(essay.tags).forEach((tag) => {
      knownTags.set(tagKey(tag), tag);
      tagAncestors(tag).forEach((label) => {
        const key = tagKey(label);
        essayPaths.add(key);
        if (nodesByKey.has(key)) return;
        const segments = label.split('/');
        const parentLabel = segments.slice(0, -1).join('/');
        nodesByKey.set(key, {
          key,
          label,
          name: segments.at(-1) || label,
          parentKey: parentLabel ? tagKey(parentLabel) : ROOT_TAG_KEY,
          count: 0,
          children: [],
        });
      });
    });
    essayPaths.forEach((key) => {
      const ids = essayIdsByKey.get(key) ?? new Set<string>();
      ids.add(essay.id);
      essayIdsByKey.set(key, ids);
    });
  });

  nodesByKey.forEach((node) => {
    node.count = essayIdsByKey.get(node.key)?.size ?? 0;
    if (node.parentKey !== ROOT_TAG_KEY) nodesByKey.get(node.parentKey)?.children.push(node);
  });

  const sortBranch = (nodes: TagNode[], parentKey: string) => {
    const order = orderByParent[parentKey] ?? [];
    nodes.sort((left, right) => compareTagNodes(left, right, order));
    nodes.forEach((node) => sortBranch(node.children, node.key));
  };
  const roots = [...nodesByKey.values()].filter((node) => node.parentKey === ROOT_TAG_KEY);
  sortBranch(roots, ROOT_TAG_KEY);

  const flatNodes: TagNode[] = [];
  const flatten = (nodes: TagNode[]) => nodes.forEach((node) => {
    flatNodes.push(node);
    flatten(node.children);
  });
  flatten(roots);

  return {
    nodes: roots,
    flatNodes,
    knownTags: [...knownTags.values()].sort((left, right) => left.localeCompare(right, 'zh-CN')),
  };
}

export function parentTagKeys(key: string) {
  const segments = key.split('/');
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'));
}
