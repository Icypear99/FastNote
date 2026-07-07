import {useEffect, useState} from 'react';
import type {Note} from '../types';
import {commands} from '../services/commands';
import {useUiStore} from '../stores/uiStore';

export default function NotesPage({notes, run}: {notes: Note[]; run: <T>(action: Promise<T>) => Promise<T>}) {
  const {selectedNoteId, setSelectedNoteId} = useUiStore();
  const activeNotes = notes.filter((note) => !note.archivedAt);
  const selected = activeNotes.find((note) => note.id === selectedNoteId) ?? activeNotes[0];
  const [draft, setDraft] = useState<Note | undefined>(selected);

  useEffect(() => {
    setDraft(selected);
  }, [selected?.id]);

  const create = async () => {
    const note = await run(commands.createNote({title: '新的笔记', content: '# 新的笔记\n\n'}));
    setSelectedNoteId(note.id);
  };

  const save = async () => {
    if (!draft) return;
    await run(commands.updateNote(draft));
  };

  return (
    <div className="notes-layout">
      <aside className="note-sidebar">
        <button className="dark-btn block-btn" type="button" onClick={create}>
          新建笔记
        </button>
        <div className="note-list">
          {activeNotes.map((note) => (
            <button
              className={`note-item ${note.id === selected?.id ? 'active' : ''}`}
              key={note.id}
              type="button"
              onClick={() => setSelectedNoteId(note.id)}
            >
              <span>{note.title}</span>
              <small>{note.summary || note.content.slice(0, 36)}</small>
            </button>
          ))}
        </div>
      </aside>
      <section className="note-editor">
        {draft ? (
          <>
            <div className="editor-bar">
              <input value={draft.title} onChange={(event) => setDraft({...draft, title: event.target.value})} />
              <button type="button" onClick={save}>
                保存
              </button>
              <button type="button" onClick={() => run(commands.archiveNote(draft.id))}>
                归档
              </button>
            </div>
            <textarea value={draft.content} onChange={(event) => setDraft({...draft, content: event.target.value})} />
          </>
        ) : (
          <div className="empty-state">
            <strong>暂无笔记</strong>
            <button type="button" className="primary-btn" onClick={create}>
              创建第一篇
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
