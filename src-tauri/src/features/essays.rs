use std::fs;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use image::{GenericImageView, ImageFormat};
use rusqlite::{params, Connection, Transaction};
use tauri::State;

use crate::database::DEFAULT_CATEGORY_ID;
use crate::models::{Essay, EssayAttachment, EssayCategory, EssayCategoryPatch, EssayPatch};
use crate::state::{open_db, AppState};
use crate::utils::{empty_to_none, new_id, now};

const MAX_ATTACHMENT_BYTES: usize = 10 * 1024 * 1024;
const THUMBNAIL_EDGE: u32 = 640;

#[tauri::command]
pub(crate) fn essay_attachment_import(
    state: State<AppState>,
    file_name: String,
    mime_type: String,
    data_base64: String,
) -> Result<EssayAttachment, String> {
    let bytes = BASE64
        .decode(data_base64)
        .map_err(|_| "图片数据无效".to_string())?;
    if bytes.is_empty() {
        return Err("图片内容为空".to_string());
    }
    if bytes.len() > MAX_ATTACHMENT_BYTES {
        return Err("单张图片不能超过 10 MB".to_string());
    }

    let format = image::guess_format(&bytes).map_err(|_| "无法识别图片格式".to_string())?;
    let (extension, detected_mime) = image_format_metadata(format)?;
    if !mime_type.is_empty() && !mime_type.starts_with("image/") {
        return Err("仅支持图片附件".to_string());
    }
    let decoded = image::load_from_memory_with_format(&bytes, format)
        .map_err(|_| "图片已损坏或格式不受支持".to_string())?;
    let (width, height) = decoded.dimensions();

    let attachment_id = new_id();
    let attachment_root = attachment_root(&state.db_path)?;
    let original_path = attachment_root.join(format!("{attachment_id}.{extension}"));
    let thumbnail_path = attachment_root.join(format!("{attachment_id}.thumb.png"));
    fs::write(&original_path, &bytes).map_err(|error| error.to_string())?;
    decoded
        .thumbnail(THUMBNAIL_EDGE, THUMBNAIL_EDGE)
        .save_with_format(&thumbnail_path, ImageFormat::Png)
        .map_err(|error| error.to_string())?;

    let timestamp = now();
    let conn = open_db(&state)?;
    conn.execute(
        "INSERT INTO note_attachments
        (id, note_id, file_name, storage_path, thumbnail_path, mime_type, size_bytes, width, height, order_num, created_at, updated_at)
        VALUES (?1, NULL, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?9)",
        params![
            attachment_id,
            sanitized_file_name(&file_name, extension),
            original_path.to_string_lossy(),
            thumbnail_path.to_string_lossy(),
            detected_mime,
            bytes.len() as i64,
            i64::from(width),
            i64::from(height),
            timestamp,
        ],
    )
    .map_err(|error| error.to_string())?;
    read_attachment(&conn, &attachment_id)
}

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
    let mut conn = open_db(&state)?;
    let timestamp = now();
    let id = new_id();
    let attachment_ids = essay.attachment_ids.unwrap_or_default();
    let tags = serde_json::to_string(&essay.tags.unwrap_or_default())
        .map_err(|error| error.to_string())?;
    let transaction = conn.transaction().map_err(|error| error.to_string())?;
    transaction.execute(
        "INSERT INTO notes (id, title, content, content_format, content_json, summary, category_id, tags, status, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
        params![
            id,
            essay.title.unwrap_or_else(|| "新的随笔".to_string()),
            essay.content.unwrap_or_default(),
            essay.content_format.unwrap_or_else(|| "markdown".to_string()),
            essay.content_json.unwrap_or_default(),
            essay.summary.unwrap_or_default(),
            empty_to_none(essay.category_id).unwrap_or_else(|| DEFAULT_CATEGORY_ID.to_string()),
            tags,
            essay.status.unwrap_or_else(|| "draft".to_string()),
            timestamp
        ],
    )
    .map_err(|error| error.to_string())?;
    sync_attachments(&transaction, &id, &attachment_ids)?;
    transaction.commit().map_err(|error| error.to_string())?;
    read_essay(&conn, &id)
}

#[tauri::command]
pub(crate) fn essay_update(state: State<AppState>, essay: EssayPatch) -> Result<Essay, String> {
    let mut conn = open_db(&state)?;
    let id = essay.id.ok_or_else(|| "随笔 id 不能为空".to_string())?;
    let current = read_essay(&conn, &id)?;
    let attachment_ids = essay.attachment_ids;
    let tags = serde_json::to_string(&essay.tags.unwrap_or(current.tags))
        .map_err(|error| error.to_string())?;
    let next_category_id = match essay.category_id {
        Some(value) if value.trim().is_empty() => None,
        Some(value) => Some(value.trim().to_string()),
        None => current.category_id,
    };
    let transaction = conn.transaction().map_err(|error| error.to_string())?;
    transaction
        .execute(
            "UPDATE notes SET title = ?1, content = ?2, content_format = ?3, content_json = ?4,
        summary = ?5, category_id = ?6, tags = ?7, status = ?8, archived_at = ?9, updated_at = ?10
        WHERE id = ?11",
            params![
                essay.title.unwrap_or(current.title),
                essay.content.unwrap_or(current.content),
                essay.content_format.unwrap_or(current.content_format),
                essay.content_json.unwrap_or(current.content_json),
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
    if let Some(attachment_ids) = attachment_ids {
        sync_attachments(&transaction, &id, &attachment_ids)?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
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
            content_format: None,
            content_json: None,
            summary: None,
            category_id: None,
            tags: None,
            status: None,
            attachment_ids: None,
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
    let mut essay = conn.query_row(
        "SELECT id, title, content, content_format, content_json, summary, category_id, tags, status, archived_at, created_at, updated_at
        FROM notes WHERE id = ?1",
        params![id],
        map_essay,
    )
    .map_err(|error| error.to_string())?;
    essay.attachments = read_attachments(conn, id)?;
    Ok(essay)
}

pub(crate) fn read_essays(conn: &Connection) -> Result<Vec<Essay>, String> {
    let mut essays = {
        let mut stmt = conn
            .prepare(
                "SELECT id, title, content, content_format, content_json, summary, category_id, tags, status, archived_at, created_at, updated_at
                FROM notes ORDER BY updated_at DESC",
            )
            .map_err(|error| error.to_string())?;
        let essays = stmt
            .query_map([], map_essay)
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        essays
    };
    for essay in &mut essays {
        essay.attachments = read_attachments(conn, &essay.id)?;
    }
    Ok(essays)
}

fn map_essay(row: &rusqlite::Row) -> rusqlite::Result<Essay> {
    let tags: String = row.get(7)?;
    let category_id: Option<String> = row.get(6)?;
    Ok(Essay {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        content_format: row.get(3)?,
        content_json: row.get(4)?,
        summary: row.get(5)?,
        category_id: category_id.or_else(|| Some(DEFAULT_CATEGORY_ID.to_string())),
        tags: serde_json::from_str(&tags).unwrap_or_default(),
        status: row.get(8)?,
        archived_at: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        attachments: Vec::new(),
    })
}

fn image_format_metadata(format: ImageFormat) -> Result<(&'static str, &'static str), String> {
    match format {
        ImageFormat::Png => Ok(("png", "image/png")),
        ImageFormat::Jpeg => Ok(("jpg", "image/jpeg")),
        ImageFormat::Gif => Ok(("gif", "image/gif")),
        ImageFormat::WebP => Ok(("webp", "image/webp")),
        _ => Err("仅支持 JPG、PNG、GIF 和 WebP 图片".to_string()),
    }
}

fn sanitized_file_name(file_name: &str, extension: &str) -> String {
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image")
        .chars()
        .filter(|character| character.is_alphanumeric() || matches!(character, '-' | '_' | ' '))
        .take(80)
        .collect::<String>();
    let stem = stem.trim();
    format!(
        "{}.{}",
        if stem.is_empty() { "image" } else { stem },
        extension
    )
}

fn attachment_root(db_path: &Path) -> Result<PathBuf, String> {
    let parent = db_path
        .parent()
        .ok_or_else(|| "工作区路径无效".to_string())?;
    let root = parent.join("attachments");
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    Ok(root)
}

fn sync_attachments(
    transaction: &Transaction<'_>,
    note_id: &str,
    attachment_ids: &[String],
) -> Result<(), String> {
    let timestamp = now();
    transaction
        .execute(
            "UPDATE note_attachments SET archived_at = ?1, updated_at = ?1
            WHERE note_id = ?2 AND archived_at IS NULL",
            params![timestamp, note_id],
        )
        .map_err(|error| error.to_string())?;

    for (index, attachment_id) in attachment_ids.iter().enumerate() {
        let updated = transaction
            .execute(
                "UPDATE note_attachments
                SET note_id = ?1, order_num = ?2, archived_at = NULL, updated_at = ?3
                WHERE id = ?4 AND (note_id IS NULL OR note_id = ?1)",
                params![note_id, index as i64, timestamp, attachment_id],
            )
            .map_err(|error| error.to_string())?;
        if updated == 0 {
            return Err("存在无效的图片附件".to_string());
        }
    }
    Ok(())
}

fn read_attachment(conn: &Connection, id: &str) -> Result<EssayAttachment, String> {
    let mut attachment = conn
        .query_row(
            "SELECT id, note_id, file_name, storage_path, thumbnail_path, mime_type, size_bytes,
            width, height, order_num, archived_at, created_at, updated_at
            FROM note_attachments WHERE id = ?1",
            params![id],
            map_attachment,
        )
        .map_err(|error| error.to_string())?;
    hydrate_attachment_preview(&mut attachment)?;
    Ok(attachment)
}

fn read_attachments(conn: &Connection, note_id: &str) -> Result<Vec<EssayAttachment>, String> {
    let mut attachments = {
        let mut statement = conn
            .prepare(
                "SELECT id, note_id, file_name, storage_path, thumbnail_path, mime_type, size_bytes,
                width, height, order_num, archived_at, created_at, updated_at
                FROM note_attachments
                WHERE note_id = ?1 AND archived_at IS NULL
                ORDER BY order_num ASC, created_at ASC",
            )
            .map_err(|error| error.to_string())?;
        let attachments = statement
            .query_map(params![note_id], map_attachment)
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        attachments
    };
    for attachment in &mut attachments {
        hydrate_attachment_preview(attachment)?;
    }
    Ok(attachments)
}

fn map_attachment(row: &rusqlite::Row) -> rusqlite::Result<EssayAttachment> {
    Ok(EssayAttachment {
        id: row.get(0)?,
        note_id: row.get(1)?,
        file_name: row.get(2)?,
        storage_path: row.get(3)?,
        thumbnail_path: row.get(4)?,
        mime_type: row.get(5)?,
        size_bytes: row.get(6)?,
        width: row.get(7)?,
        height: row.get(8)?,
        order_num: row.get(9)?,
        archived_at: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        preview_data_url: String::new(),
    })
}

fn hydrate_attachment_preview(attachment: &mut EssayAttachment) -> Result<(), String> {
    let bytes = fs::read(&attachment.thumbnail_path).map_err(|error| error.to_string())?;
    attachment.preview_data_url = format!("data:image/png;base64,{}", BASE64.encode(bytes));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn attachment_connection() -> Connection {
        let connection = Connection::open_in_memory().expect("open attachment test database");
        connection
            .execute_batch(
                "CREATE TABLE note_attachments (
                    id TEXT PRIMARY KEY,
                    note_id TEXT,
                    file_name TEXT NOT NULL,
                    storage_path TEXT NOT NULL,
                    thumbnail_path TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL DEFAULT 0,
                    width INTEGER NOT NULL DEFAULT 0,
                    height INTEGER NOT NULL DEFAULT 0,
                    order_num INTEGER NOT NULL DEFAULT 0,
                    archived_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );",
            )
            .expect("create attachment schema");
        connection
    }

    #[test]
    fn attachment_file_name_is_confined_and_normalized() {
        assert_eq!(
            sanitized_file_name("../../photo.final.PNG", "png"),
            "photofinal.png"
        );
        assert_eq!(sanitized_file_name("<>:.png", "png"), "image.png");
        assert_eq!(sanitized_file_name("截图 01.webp", "webp"), "截图 01.webp");
    }

    #[test]
    fn attachment_sync_soft_archives_removed_associations() {
        let mut connection = attachment_connection();
        connection
            .execute_batch(
                "INSERT INTO note_attachments
                    (id, note_id, file_name, storage_path, thumbnail_path, mime_type, created_at, updated_at)
                 VALUES
                    ('keep', 'note', 'keep.png', 'keep.png', 'keep.thumb.png', 'image/png', 'before', 'before'),
                    ('remove', 'note', 'remove.png', 'remove.png', 'remove.thumb.png', 'image/png', 'before', 'before');",
            )
            .expect("insert attachments");

        let transaction = connection.transaction().expect("start transaction");
        sync_attachments(&transaction, "note", &["keep".to_string()]).expect("sync attachments");
        transaction.commit().expect("commit attachment sync");

        let keep_archived: Option<String> = connection
            .query_row(
                "SELECT archived_at FROM note_attachments WHERE id = 'keep'",
                [],
                |row| row.get(0),
            )
            .expect("read kept attachment");
        let remove_archived: Option<String> = connection
            .query_row(
                "SELECT archived_at FROM note_attachments WHERE id = 'remove'",
                [],
                |row| row.get(0),
            )
            .expect("read removed attachment");

        assert!(keep_archived.is_none());
        assert!(remove_archived.is_some());
    }

    #[test]
    fn attachment_sync_rolls_back_when_an_id_is_invalid() {
        let mut connection = attachment_connection();
        connection
            .execute_batch(
                "INSERT INTO note_attachments
                    (id, note_id, file_name, storage_path, thumbnail_path, mime_type, created_at, updated_at)
                 VALUES ('keep', 'note', 'keep.png', 'keep.png', 'keep.thumb.png', 'image/png', 'before', 'before');",
            )
            .expect("insert attachment");

        {
            let transaction = connection.transaction().expect("start transaction");
            assert!(sync_attachments(&transaction, "note", &["missing".to_string()]).is_err());
        }

        let archived_at: Option<String> = connection
            .query_row(
                "SELECT archived_at FROM note_attachments WHERE id = 'keep'",
                [],
                |row| row.get(0),
            )
            .expect("read attachment after rollback");
        assert!(archived_at.is_none());
    }
}
