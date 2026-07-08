import {useEffect, useMemo, useState} from 'react';
import type {CSSProperties} from 'react';
import type {Essay, EssayCategory} from '../../shared/types';
import {commands} from '../../core/services/commands';
import {useUiStore} from '../../app/stores/uiStore';

export default function EssaysPage({
  essays,
  categories,
  run,
}: {
  essays: Essay[];
  categories: EssayCategory[];
  run: <T>(action: Promise<T>) => Promise<T>;
}) {
  const {selectedEssayId, setSelectedEssayId} = useUiStore();
  const activeCategories = categories.filter((category) => !category.archivedAt);
  const activeEssays = essays.filter((essay) => !essay.archivedAt);
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [categoryName, setCategoryName] = useState('');
  const [categoryColor, setCategoryColor] = useState('#64748b');

  const filteredEssays = useMemo(() => {
    if (selectedCategoryId === 'all') return activeEssays;
    return activeEssays.filter((essay) => essay.categoryId === selectedCategoryId);
  }, [activeEssays, selectedCategoryId]);
  const selected = filteredEssays.find((essay) => essay.id === selectedEssayId) ?? filteredEssays[0] ?? activeEssays[0];
  const [draft, setDraft] = useState<Essay | undefined>(selected);
  const [tagInput, setTagInput] = useState('');
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const selectedCategory = activeCategories.find((category) => category.id === selectedCategoryId);

  useEffect(() => {
    setDraft(selected);
    setTagInput(selected?.tags.join(', ') ?? '');
  }, [selected?.id]);

  const createCategory = async () => {
    if (!categoryName.trim()) return;
    const category = await run(commands.createEssayCategory({name: categoryName.trim(), color: categoryColor}));
    setSelectedCategoryId(category.id);
    setCategoryName('');
  };

  const updateSelectedCategory = async () => {
    if (!selectedCategory || !categoryName.trim()) return;
    await run(commands.updateEssayCategory({id: selectedCategory.id, name: categoryName.trim(), color: categoryColor}));
    setCategoryName('');
  };

  const archiveSelectedCategory = async () => {
    if (!selectedCategory) return;
    await run(commands.archiveEssayCategory(selectedCategory.id));
    setSelectedCategoryId('all');
  };

  const startCategoryEdit = (category: EssayCategory) => {
    setSelectedCategoryId(category.id);
    setCategoryName(category.name);
    setCategoryColor(category.color);
  };

  const createEssay = async () => {
    const essay = await run(
      commands.createEssay({
        title: '新的随笔',
        content: '# 新的随笔\n\n',
        categoryId: selectedCategoryId === 'all' ? activeCategories[0]?.id : selectedCategoryId,
      }),
    );
    setSelectedEssayId(essay.id);
  };

  const saveEssay = async () => {
    if (!draft) return;
    await run(
      commands.updateEssay({
        ...draft,
        tags: tagInput
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      }),
    );
  };

  return (
    <div className="essays-layout">
      <aside className="essay-category-rail">
        <div className="rail-heading">
          <span>随笔分类</span>
          <strong>{activeCategories.length}</strong>
        </div>
        <button className={`project-filter ${selectedCategoryId === 'all' ? 'active' : ''}`} type="button" onClick={() => setSelectedCategoryId('all')}>
          <span className="project-color-dot neutral" />
          <span>全部随笔</span>
          <small>{activeEssays.length}</small>
        </button>
        {activeCategories.map((category) => (
          <button
            className={`project-filter ${selectedCategoryId === category.id ? 'active' : ''}`}
            key={category.id}
            type="button"
            onClick={() => startCategoryEdit(category)}
          >
            <span className="project-color-dot" style={{'--item-color': category.color} as CSSProperties} />
            <span>{category.name}</span>
            <small>{activeEssays.filter((essay) => essay.categoryId === category.id).length}</small>
          </button>
        ))}

        <section className="compact-form">
          <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="分类名称" />
          <div className="color-field">
            <input type="color" value={categoryColor} onChange={(event) => setCategoryColor(event.target.value)} />
            <span>{categoryColor}</span>
          </div>
          <div className="compact-actions">
            <button className="primary-btn" type="button" onClick={selectedCategory ? updateSelectedCategory : createCategory}>
              {selectedCategory ? '保存分类' : '新建分类'}
            </button>
            {selectedCategory && (
              <button type="button" onClick={archiveSelectedCategory}>
                归档
              </button>
            )}
          </div>
        </section>
      </aside>

      <aside className="essay-list-panel">
        <header className="module-header compact">
          <div>
            <span className="section-label">快速记录</span>
            <h2>{selectedCategory?.name ?? '全部随笔'}</h2>
          </div>
          <button className="primary-btn" type="button" onClick={createEssay}>
            新建
          </button>
        </header>
        <div className="essay-list">
          {filteredEssays.map((essay) => {
            const category = essay.categoryId ? categoryById.get(essay.categoryId) : undefined;
            return (
              <button
                className={`essay-item ${essay.id === selected?.id ? 'active' : ''}`}
                key={essay.id}
                type="button"
                onClick={() => setSelectedEssayId(essay.id)}
              >
                <strong>{essay.title}</strong>
                <small>{essay.summary || essay.content.replace(/[#*`>-]/g, '').slice(0, 56) || '暂无内容'}</small>
                <span className="essay-item-meta">
                  {category && (
                    <i style={{'--item-color': category.color} as CSSProperties}>
                      {category.name}
                    </i>
                  )}
                  {essay.tags.slice(0, 2).map((tag) => (
                    <em key={tag}>{tag}</em>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="essay-editor">
        {draft ? (
          <>
            <div className="editor-bar essay-editor-bar">
              <input value={draft.title} onChange={(event) => setDraft({...draft, title: event.target.value})} />
              <select value={draft.categoryId ?? ''} onChange={(event) => setDraft({...draft, categoryId: event.target.value || undefined})}>
                {activeCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <input value={tagInput} onChange={(event) => setTagInput(event.target.value)} placeholder="标签，逗号分隔" />
              <button type="button" onClick={saveEssay}>
                保存
              </button>
              <button type="button" onClick={() => run(commands.archiveEssay(draft.id))}>
                归档
              </button>
            </div>
            <textarea value={draft.content} onChange={(event) => setDraft({...draft, content: event.target.value})} />
          </>
        ) : (
          <div className="empty-state">
            <strong>暂无随笔</strong>
            <span>先记录一个想法，之后再慢慢整理。</span>
            <button type="button" className="primary-btn" onClick={createEssay}>
              创建第一篇
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
