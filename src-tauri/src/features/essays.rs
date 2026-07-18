use rusqlite::{params, Connection};
use tauri::State;

use crate::database::DEFAULT_CATEGORY_ID;
use crate::models::{Essay, EssayCategory, EssayCategoryPatch, EssayPatch};
use crate::state::{open_db, AppState};
use crate::utils::{empty_to_none, new_id, now};

#[tauri::command]
pub(crate) fn essay_category_create(
    state: State<AppState>,
    category: EssayCategoryPatch,
) -> Result<EssayCategory, String> {
    let conn = open_db(&state)?;
    let id = new_id();
    let timestamp = now();
    let order_num: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(order_num), 0) + 1 FROM essay_categories",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    conn.execute(
        "INSERT INTO essay_categories (id, name, color, order_num, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![
            id,
            category.name.unwrap_or_else(|| "新分类".to_string()),
            category.color.unwrap_or_else(|| "#64748b".to_string()),
            category.order_num.unwrap_or(order_num),
            timestamp
        ],
    )
    .map_err(|error| error.to_string())?;
    read_essay_category(&conn, &id)
}

#[tauri::command]
pub(crate) fn essay_category_update(
    state: State<AppState>,
    category: EssayCategoryPatch,
) -> Result<EssayCategory, String> {
    let conn = open_db(&state)?;
    let id = category
        .id
        .ok_or_else(|| "随笔分类 id 不能为空".to_string())?;
    let current = read_essay_category(&conn, &id)?;
    conn.execute(
        "UPDATE essay_categories SET name = ?1, color = ?2, order_num = ?3, archived_at = ?4, updated_at = ?5
        WHERE id = ?6",
        params![
            category.name.unwrap_or(current.name),
            category.color.unwrap_or(current.color),
            category.order_num.unwrap_or(current.order_num),
            category.archived_at.or(current.archived_at),
            now(),
            id
        ],
    )
    .map_err(|error| error.to_string())?;
    read_essay_category(&conn, &id)
}

#[tauri::command]
pub(crate) fn essay_category_archive(
    state: State<AppState>,
    id: String,
) -> Result<EssayCategory, String> {
    essay_category_update(
        state,
        EssayCategoryPatch {
            id: Some(id),
            name: None,
            color: None,
            order_num: None,
            archived_at: Some(now()),
        },
    )
}

#[tauri::command]
pub(crate) fn essay_create(state: State<AppState>, essay: EssayPatch) -> Result<Essay, String> {
    let conn = open_db(&state)?;
    let timestamp = now();
    let id = new_id();
    let tags = serde_json::to_string(&essay.tags.unwrap_or_default())
        .map_err(|error| error.to_string())?;
    conn.execute(
        "INSERT INTO notes (id, title, content, summary, category_id, tags, status, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
        params![
            id,
            essay.title.unwrap_or_else(|| "新的随笔".to_string()),
            essay.content.unwrap_or_default(),
            essay.summary.unwrap_or_default(),
            empty_to_none(essay.category_id).unwrap_or_else(|| DEFAULT_CATEGORY_ID.to_string()),
            tags,
            essay.status.unwrap_or_else(|| "draft".to_string()),
            timestamp
        ],
    )
    .map_err(|error| error.to_string())?;
    read_essay(&conn, &id)
}

#[tauri::command]
pub(crate) fn essay_update(state: State<AppState>, essay: EssayPatch) -> Result<Essay, String> {
    let conn = open_db(&state)?;
    let id = essay.id.ok_or_else(|| "随笔 id 不能为空".to_string())?;
    let current = read_essay(&conn, &id)?;
    let tags = serde_json::to_string(&essay.tags.unwrap_or(current.tags))
        .map_err(|error| error.to_string())?;
    let next_category_id = match essay.category_id {
        Some(value) if value.trim().is_empty() => None,
        Some(value) => Some(value.trim().to_string()),
        None => current.category_id,
    };
    conn.execute(
        "UPDATE notes SET title = ?1, content = ?2, summary = ?3, category_id = ?4, tags = ?5,
        status = ?6, archived_at = ?7, updated_at = ?8 WHERE id = ?9",
        params![
            essay.title.unwrap_or(current.title),
            essay.content.unwrap_or(current.content),
            essay.summary.unwrap_or(current.summary),
            next_category_id,
            tags,
            essay.status.unwrap_or(current.status),
            essay.archived_at.or(current.archived_at),
            now(),
            id
        ],
    )
    .map_err(|error| error.to_string())?;
    read_essay(&conn, &id)
}

#[tauri::command]
pub(crate) fn essay_archive(state: State<AppState>, id: String) -> Result<Essay, String> {
    essay_update(
        state,
        EssayPatch {
            id: Some(id),
            archived_at: Some(now()),
            title: None,
            content: None,
            summary: None,
            category_id: None,
            tags: None,
            status: None,
        },
    )
}

#[tauri::command]
pub(crate) fn essay_restore(state: State<AppState>, id: String) -> Result<Essay, String> {
    let conn = open_db(&state)?;
    conn.execute(
        "UPDATE notes SET archived_at = NULL, updated_at = ?1 WHERE id = ?2",
        params![now(), id],
    )
    .map_err(|error| error.to_string())?;
    read_essay(&conn, &id)
}

pub(crate) fn read_essay_category(conn: &Connection, id: &str) -> Result<EssayCategory, String> {
    conn.query_row(
        "SELECT id, name, color, order_num, archived_at, created_at, updated_at FROM essay_categories WHERE id = ?1",
        params![id],
        map_essay_category,
    )
    .map_err(|error| error.to_string())
}

pub(crate) fn read_essay_categories(conn: &Connection) -> Result<Vec<EssayCategory>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, color, order_num, archived_at, created_at, updated_at FROM essay_categories ORDER BY order_num ASC, updated_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let categories = stmt
        .query_map([], map_essay_category)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(categories)
}

fn map_essay_category(row: &rusqlite::Row) -> rusqlite::Result<EssayCategory> {
    Ok(EssayCategory {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
        order_num: row.get(3)?,
        archived_at: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

pub(crate) fn read_essay(conn: &Connection, id: &str) -> Result<Essay, String> {
    conn.query_row(
        "SELECT id, title, content, summary, category_id, tags, status, archived_at, created_at, updated_at FROM notes WHERE id = ?1",
        params![id],
        map_essay,
    )
    .map_err(|error| error.to_string())
}

pub(crate) fn read_essays(conn: &Connection) -> Result<Vec<Essay>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, title, content, summary, category_id, tags, status, archived_at, created_at, updated_at FROM notes ORDER BY updated_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let essays = stmt
        .query_map([], map_essay)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(essays)
}

fn map_essay(row: &rusqlite::Row) -> rusqlite::Result<Essay> {
    let tags: String = row.get(5)?;
    let category_id: Option<String> = row.get(4)?;
    Ok(Essay {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        summary: row.get(3)?,
        category_id: category_id.or_else(|| Some(DEFAULT_CATEGORY_ID.to_string())),
        tags: serde_json::from_str(&tags).unwrap_or_default(),
        status: row.get(6)?,
        archived_at: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}
