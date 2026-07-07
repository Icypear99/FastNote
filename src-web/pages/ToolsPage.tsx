import {useState} from 'react';

export default function ToolsPage() {
  const [tool, setTool] = useState('json');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');

  const runTool = () => {
    try {
      setOutput(runToolAction(tool, input));
    } catch (error) {
      setOutput(error instanceof Error ? error.message : '处理失败');
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
        <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入内容" />
        <textarea value={output} onChange={(event) => setOutput(event.target.value)} placeholder="输出结果" />
      </section>
    </div>
  );
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
