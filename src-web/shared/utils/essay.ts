export function normalizeTag(value: string) {
  return value
    .trim()
    .replace(/^#+/, '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

export function tagKey(value: string) {
  return normalizeTag(value).toLocaleLowerCase('zh-CN');
}

export function normalizeTags(values: string[]) {
  const tags = new Map<string, string>();
  values.forEach((value) => {
    const normalized = normalizeTag(value);
    const key = tagKey(normalized);
    if (key && !tags.has(key)) tags.set(key, normalized);
  });
  return [...tags.values()];
}

export function tagAncestors(value: string) {
  const segments = normalizeTag(value).split('/').filter(Boolean);
  return segments.map((_, index) => segments.slice(0, index + 1).join('/'));
}

export function tagMatchesPath(value: string, path: string) {
  const valueKey = tagKey(value);
  const pathKey = tagKey(path);
  return Boolean(pathKey) && (valueKey === pathKey || valueKey.startsWith(`${pathKey}/`));
}

export function stripEssayMarkdown(content: string) {
  return content
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|>\s+|\d+[.)]\s+)/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function deriveEssayMetadata(content: string) {
  const plainText = stripEssayMarkdown(content);
  return {
    title: plainText.slice(0, 48) || '随笔',
    summary: plainText.slice(0, 140),
  };
}

export function essayExcerpt(content: string, summary = '') {
  return (summary.trim() || stripEssayMarkdown(content) || '快速记录').slice(0, 80);
}
