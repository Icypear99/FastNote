import {useState} from 'react';
import type {AiConversation, AiMessage, Settings} from '../types';
import {commands} from '../services/commands';
import {useUiStore} from '../stores/uiStore';

export default function AssistantPage({
  conversations,
  messages,
  settings,
  run,
}: {
  conversations: AiConversation[];
  messages: AiMessage[];
  settings: Settings;
  run: <T>(action: Promise<T>) => Promise<T>;
}) {
  const {selectedConversationId, setSelectedConversationId} = useUiStore();
  const [prompt, setPrompt] = useState('');
  const activeConversationId = selectedConversationId ?? conversations[0]?.id;
  const visibleMessages = messages.filter((message) => message.conversationId === activeConversationId).slice(-10);

  const send = async () => {
    if (!prompt.trim()) return;
    const result = await run(commands.sendMessage(prompt, activeConversationId));
    setSelectedConversationId(result.conversation.id);
    setPrompt('');
  };

  return (
    <div className="assistant-layout">
      <aside className="conversation-panel">
        <button className="dark-btn block-btn" type="button" onClick={() => setSelectedConversationId(undefined)}>
          新对话
        </button>
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            className={`conversation-item ${conversation.id === activeConversationId ? 'active' : ''}`}
            type="button"
            onClick={() => setSelectedConversationId(conversation.id)}
          >
            <span>{conversation.title}</span>
            <small>{new Date(conversation.updatedAt).toLocaleString()}</small>
          </button>
        ))}
      </aside>
      <section className="chat-area">
        <div className="assistant-status">模式：{settings.aiProvider === 'mock' ? '本地' : settings.aiModel}</div>
        <div className="message-panel">
          {visibleMessages.length === 0 ? (
            <div className="muted-row">输入内容开始对话</div>
          ) : (
            visibleMessages.map((message) => (
              <article className={`message-bubble ${message.role}`} key={message.id}>
                <span>{message.role === 'user' ? '你' : '助手'}</span>
                <p>{message.content}</p>
              </article>
            ))
          )}
        </div>
        <div className="composer-row">
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="输入问题或指令" />
          <button className="dark-btn" type="button" onClick={send}>
            发送
          </button>
        </div>
      </section>
    </div>
  );
}
