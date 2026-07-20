use std::fs;
use std::path::PathBuf;

use rusqlite::{params, Connection, OptionalExtension};
use tauri::{AppHandle, Manager};

use crate::utils::{new_id, now};

pub(crate) const DEFAULT_PROJECT_ID: &str = "default-project";
pub(crate) const DEFAULT_CATEGORY_ID: &str = "default-essay-category";
pub(crate) const ESSAY_CATEGORY_TAG_MIGRATION_KEY: &str = "migration.essay_categories_to_tags.v1";

pub(crate) fn app_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("workspace.sqlite"))
}

pub(crate) fn init_db(db_path: &PathBuf) -> Result<(), String> {
    let mut conn = Connection::open(db_path).map_err(|error| error.to_string())?;
    conn.execute_batch(include_str!("../migrations/001_init.sql"))
        .map_err(|error| error.to_string())?;
    ensure_schema(&conn)?;
    seed_defaults(&conn)?;
    migrate_essay_categories_to_tags(&mut conn)
}

fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            archived_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|error| error.to_string())?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS essay_categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            order_num INTEGER NOT NULL DEFAULT 0,
            archived_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|error| error.to_string())?;
    ensure_column(conn, "tasks", "project_id", "TEXT")?;
    ensure_column(conn, "tasks", "progress", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(conn, "notes", "category_id", "TEXT")?;
    ensure_column(
        conn,
        "notes",
        "content_format",
        "TEXT NOT NULL DEFAULT 'markdown'",
    )?;
    ensure_column(conn, "notes", "content_json", "TEXT NOT NULL DEFAULT ''")?;
    ensure_column(conn, "notes", "is_pinned", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(conn, "user_profile", "age", "TEXT NOT NULL DEFAULT ''")?;
    ensure_column(
        conn,
        "user_profile",
        "personality",
        "TEXT NOT NULL DEFAULT ''",
    )?;
    ensure_column(conn, "user_profile", "gender", "TEXT NOT NULL DEFAULT ''")?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS note_attachments (
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
        )",
        [],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn ensure_column(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), String> {
    if !column_exists(conn, table, column)? {
        conn.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
            [],
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|error| error.to_string())?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(columns.iter().any(|item| item == column))
}

fn normalize_tag(value: &str) -> String {
    value.trim().trim_start_matches('#').trim().to_lowercase()
}

pub(crate) fn migrate_essay_categories_to_tags(conn: &mut Connection) -> Result<(), String> {
    let transaction = conn.transaction().map_err(|error| error.to_string())?;
    let is_complete = transaction
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![ESSAY_CATEGORY_TAG_MIGRATION_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .is_some();

    if is_complete {
        transaction.commit().map_err(|error| error.to_string())?;
        return Ok(());
    }

    let notes = {
        let mut statement = transaction
            .prepare(
                "SELECT notes.id, notes.tags, essay_categories.name
                FROM notes
                INNER JOIN essay_categories ON essay_categories.id = notes.category_id
                WHERE essay_categories.id <> ?1 AND TRIM(essay_categories.name) <> ''
                ORDER BY notes.id ASC",
            )
            .map_err(|error| error.to_string())?;
        let notes = statement
            .query_map(params![DEFAULT_CATEGORY_ID], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        notes
    };

    for (note_id, raw_tags, category_name) in notes {
        let mut tags =
            serde_json::from_str::<Vec<String>>(&raw_tags).map_err(|error| error.to_string())?;
        let normalized_category = normalize_tag(&category_name);
        if normalized_category.is_empty()
            || tags
                .iter()
                .any(|tag| normalize_tag(tag) == normalized_category)
        {
            continue;
        }
        tags.push(
            category_name
                .trim()
                .trim_start_matches('#')
                .trim()
                .to_string(),
        );
        let serialized = serde_json::to_string(&tags).map_err(|error| error.to_string())?;
        transaction
            .execute(
                "UPDATE notes SET tags = ?1 WHERE id = ?2",
                params![serialized, note_id],
            )
            .map_err(|error| error.to_string())?;
    }

    transaction
        .execute(
            "INSERT INTO settings (key, value) VALUES (?1, '1')",
            params![ESSAY_CATEGORY_TAG_MIGRATION_KEY],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

fn seed_defaults(conn: &Connection) -> Result<(), String> {
    let timestamp = now();
    conn.execute(
        "INSERT OR IGNORE INTO user_profile
        (id, local_user_key, nickname, avatar_url, phone, email, phone_bound, email_bound, login_provider, created_at, updated_at)
        VALUES (?1, ?2, '劲草哥', '', '', '', 0, 0, 'local', ?3, ?3)",
        params![new_id(), new_id(), timestamp],
    )
    .map_err(|error| error.to_string())?;

    conn.execute(
        "INSERT OR IGNORE INTO projects (id, name, color, created_at, updated_at)
        VALUES (?1, '日常工作', '#2563eb', ?2, ?2)",
        params![DEFAULT_PROJECT_ID, timestamp],
    )
    .map_err(|error| error.to_string())?;

    conn.execute(
        "INSERT OR IGNORE INTO essay_categories (id, name, color, order_num, created_at, updated_at)
        VALUES (?1, '未分类', '#64748b', 1, ?2, ?2)",
        params![DEFAULT_CATEGORY_ID, timestamp],
    )
    .map_err(|error| error.to_string())?;

    let defaults = [
        ("aiProvider", "mock"),
        ("aiBaseUrl", "https://api.openai.com/v1/chat/completions"),
        ("aiModel", "gpt-4.1-mini"),
        ("aiApiKey", ""),
        ("themeMode", "light"),
        ("language", "zh-CN"),
        ("fontSize", "default"),
        ("workspacePath", ""),
        ("sendMessageShortcut", "Enter"),
        ("globalSearchShortcut", "Ctrl+K"),
        ("newTaskShortcut", "Ctrl+Shift+T"),
        ("newEssayShortcut", "Ctrl+Shift+N"),
    ];
    for (key, value) in defaults {
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )
        .map_err(|error| error.to_string())?;
    }

    let card_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM dashboard_cards", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if card_count == 0 {
        for (index, card_type) in [
            "todo-overview",
            "today-focus",
            "recent-essays",
            "quick-tools",
        ]
        .iter()
        .enumerate()
        {
            conn.execute(
                "INSERT OR IGNORE INTO dashboard_cards (id, card_type, card_config, is_visible, order_num)
                VALUES (?1, ?2, '{}', 1, ?3)",
                params![new_id(), card_type, (index + 1) as i64],
            )
            .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}
