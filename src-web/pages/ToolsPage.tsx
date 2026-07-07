import {type ReactNode, useMemo, useRef, useState} from 'react';

export default function ToolsPage() {
  const [tool, setTool] = useState('json');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<JsonToolError | null>(null);

  const runTool = () => {
    try {
      setOutput(runToolAction(tool, input));
      setError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '处理失败';
      setOutput('');
      setError(tool === 'json' ? createJsonError(input, message) : {message});
    }
  };

  return (
    <div className="page-stack">
      <section className="content-section">
        <div className="section-label">开发工具</div>
        <div className="tool-toolbar">
          <select value={tool} onChange={(event) => setTool(event.target.value)}>
            <option value="json">JSON 格式化</option>
            <option value="base64-encode">Base64 编码</option>
            <option value="base64-decode">Base64 解码</option>
            <option value="url-encode">URL 编码</option>
            <option value="url-decode">URL 解码</option>
            <option value="timestamp">时间戳转换</option>
            <option value="jwt">JWT 解析</option>
            <option value="uuid">UUID 生成</option>
          </select>
          <button className="dark-btn" type="button" onClick={runTool}>
            运行
          </button>
        </div>
      </section>
      <section className="tool-workspace">
        <CodeInput value={input} onChange={setInput} placeholder="输入内容" />
        <CodeOutput value={output} error={error} highlightJson={tool === 'json'} placeholder="输出结果" />
      </section>
    </div>
  );
}

interface JsonToolError {
  message: string;
  line?: number;
  column?: number;
  sourceLine?: string;
}

function runToolAction(tool: string, input: string) {
  if (tool === 'json') return JSON.stringify(JSON.parse(input), null, 2);
  if (tool === 'base64-encode') return btoa(unescape(encodeURIComponent(input)));
  if (tool === 'base64-decode') return decodeURIComponent(escape(atob(input)));
  if (tool === 'url-encode') return encodeURIComponent(input);
  if (tool === 'url-decode') return decodeURIComponent(input);
  if (tool === 'timestamp') {
    const value = input.trim() || String(Date.now());
    const numeric = Number(value.length === 10 ? `${value}000` : value);
    const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(value);
    return [`ISO: ${date.toISOString()}`, `本地时间: ${date.toLocaleString()}`, `毫秒时间戳: ${date.getTime()}`].join('\n');
  }
  if (tool === 'jwt') {
    const [, payload] = input.split('.');
    if (!payload) throw new Error('JWT 至少需要包含 header.payload.signature');
    return JSON.stringify(JSON.parse(decodeURIComponent(escape(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))))), null, 2);
  }
  if (tool === 'uuid') return crypto.randomUUID();
  return input;
}

function CodeInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const lineGutterRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => getLineNumbers(value), [value]);

  return (
    <div className="code-panel">
      <div className="code-line-gutter" ref={lineGutterRef} aria-hidden="true">
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
      <textarea
        className="code-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => {
          if (lineGutterRef.current) lineGutterRef.current.scrollTop = event.currentTarget.scrollTop;
        }}
        placeholder={placeholder}
        spellCheck={false}
      />
    </div>
  );
}

function CodeOutput({
  value,
  error,
  highlightJson,
  placeholder,
}: {
  value: string;
  error: JsonToolError | null;
  highlightJson: boolean;
  placeholder: string;
}) {
  const lineGutterRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLPreElement>(null);
  const lines = useMemo(() => getLineNumbers(error ? formatJsonError(error) : value), [error, value]);

  return (
    <div className={`code-panel ${error ? 'has-error' : ''}`}>
      <div className="code-line-gutter" ref={lineGutterRef} aria-hidden="true">
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
      <pre
        className="code-output"
        ref={codeRef}
        onScroll={(event) => {
          if (lineGutterRef.current) lineGutterRef.current.scrollTop = event.currentTarget.scrollTop;
        }}
      >
        {error ? (
          <code className="json-error-text">{formatJsonError(error)}</code>
        ) : value ? (
          <code>{highlightJson ? renderJsonTokens(value) : value}</code>
        ) : (
          <span className="code-placeholder">{placeholder}</span>
        )}
      </pre>
    </div>
  );
}

function getLineNumbers(value: string) {
  return Array.from({length: Math.max(1, value.split('\n').length)}, (_, index) => index + 1);
}

function createJsonError(source: string, message: string): JsonToolError {
  const lineMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  const positionMatch = message.match(/position\s+(\d+)/i);
  let line = lineMatch ? Number(lineMatch[1]) : undefined;
  let column = lineMatch ? Number(lineMatch[2]) : undefined;

  if ((!line || !column) && positionMatch) {
    const position = Number(positionMatch[1]);
    const before = source.slice(0, position);
    const beforeLines = before.split('\n');
    line = beforeLines.length;
    column = beforeLines[beforeLines.length - 1].length + 1;
  }

  const sourceLine = line ? source.split('\n')[line - 1] : undefined;
  return {message, line, column, sourceLine};
}

function formatJsonError(error: JsonToolError) {
  if (!error.line || !error.column || error.sourceLine == null) {
    return `JSON 解析错误：\n${error.message}`;
  }
  return [
    `第 ${error.line} 行解析错误：`,
    error.sourceLine,
    `${' '.repeat(Math.max(0, error.column - 1))}^`,
    error.message,
  ].join('\n');
}

function renderJsonTokens(source: string) {
  const tokens: ReactNode[] = [];
  const matcher = /("(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],:])/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(source))) {
    if (match.index > cursor) tokens.push(source.slice(cursor, match.index));
    const token = match[0];
    const nextChars = source.slice(match.index + token.length);
    const isKey = token.startsWith('"') && /^\s*:/.test(nextChars);
    tokens.push(
      <span className={`json-token ${getJsonTokenClass(token, isKey)}`} key={`${match.index}-${token}`}>
        {token}
      </span>,
    );
    cursor = match.index + token.length;
  }

  if (cursor < source.length) tokens.push(source.slice(cursor));
  return tokens;
}

function getJsonTokenClass(token: string, isKey: boolean) {
  if (isKey) return 'json-key';
  if (/^"/.test(token)) return 'json-string';
  if (/^-?\d/.test(token)) return 'json-number';
  if (token === 'true' || token === 'false') return 'json-boolean';
  if (token === 'null') return 'json-null';
  if (token === ':' || token === ',') return 'json-punctuation';
  return 'json-bracket';
}
