#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, LogicalSize, Manager, Size, State};
use uuid::Uuid;

const DEFAULT_PROJECT_ID: &str = "default-project";
const DEFAULT_CATEGORY_ID: &str = "default-essay-category";

struct AppState {
    db_path: PathBuf,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UserProfile {
    id: String,
    local_user_key: String,
    nickname: String,
    avatar_url: String,
    phone: String,
    email: String,
    age: String,
    personality: String,
    gender: String,
    phone_bound: bool,
    email_bound: bool,
    login_provider: String,
    oauth_provider: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Project {
    id: String,
    name: String,
    color: String,
    archived_at: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Task {
    id: String,
    title: String,
    description: String,
    #[serde(rename = "type")]
    task_type: String,
    priority: String,
    status: String,
    project_id: Option<String>,
    labels: Vec<String>,
    due_date: String,
    progress: i64,
    parent_id: Option<String>,
    order_num: i64,
    archived_at: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct EssayCategory {
    id: String,
    name: String,
    color: String,
    order_num: i64,
    archived_at: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Essay {
    id: String,
    title: String,
    content: String,
    summary: String,
    category_id: Option<String>,
    tags: Vec<String>,
    status: String,
    archived_at: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AiConversation {
    id: String,
    title: String,
    archived_at: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AiMessage {
    id: String,
    conversation_id: String,
    role: String,
    content: String,
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DashboardCard {
    id: String,
    card_type: String,
    card_config: serde_json::Value,
    is_visible: bool,
    order_num: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Settings {
    ai_provider: String,
    ai_base_url: String,
    ai_model: String,
    ai_api_key: String,
    theme_mode: String,
    language: String,
    font_size: String,
    workspace_path: String,
    send_message_shortcut: String,
    global_search_shortcut: String,
    new_task_shortcut: String,
    new_essay_shortcut: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSnapshot {
    profile: UserProfile,
    projects: Vec<Project>,
    tasks: Vec<Task>,
    essays: Vec<Essay>,
    essay_categories: Vec<EssayCategory>,
    conversations: Vec<AiConversation>,
    messages: Vec<AiMessage>,
    dashboard_cards: Vec<DashboardCard>,
    settings: Settings,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfilePatch {
    nickname: Option<String>,
    avatar_url: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    age: Option<String>,
    personality: Option<String>,
    gender: Option<String>,
    login_provider: Option<String>,
    oauth_provider: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectPatch {
    id: Option<String>,
    name: Option<String>,
    color: Option<String>,
    archived_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskPatch {
    id: Option<String>,
    title: Option<String>,
    description: Option<String>,
    #[serde(rename = "type")]
    task_type: Option<String>,
    priority: Option<String>,
    status: Option<String>,
    project_id: Option<String>,
    labels: Option<Vec<String>>,
    due_date: Option<String>,
    progress: Option<i64>,
    parent_id: Option<String>,
    archived_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EssayCategoryPatch {
    id: Option<String>,
    name: Option<String>,
    color: Option<String>,
    order_num: Option<i64>,
    archived_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EssayPatch {
    id: Option<String>,
    title: Option<String>,
    content: Option<String>,
    summary: Option<String>,
    category_id: Option<String>,
    tags: Option<Vec<String>>,
    status: Option<String>,
    archived_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SettingsPatch {
    ai_provider: Option<String>,
    ai_base_url: Option<String>,
    ai_model: Option<String>,
    ai_api_key: Option<String>,
    theme_mode: Option<String>,
    language: Option<String>,
    font_size: Option<String>,
    workspace_path: Option<String>,
    send_message_shortcut: Option<String>,
    global_search_shortcut: Option<String>,
    new_task_shortcut: Option<String>,
    new_essay_shortcut: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatSendResult {
    conversation: AiConversation,
    messages: Vec<AiMessage>,
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

fn open_db(state: &State<AppState>) -> Result<Connection, String> {
    Connection::open(&state.db_path).map_err(|error| error.to_string())
}

fn init_db(db_path: &PathBuf) -> Result<(), String> {
    let conn = Connection::open(db_path).map_err(|error| error.to_string())?;
    conn.execute_batch(include_str!("../migrations/001_init.sql"))
        .map_err(|error| error.to_string())?;
    ensure_schema(&conn)?;
    seed_defaults(&conn)
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
    ensure_column(conn, "user_profile", "age", "TEXT NOT NULL DEFAULT ''")?;
    ensure_column(conn, "user_profile", "personality", "TEXT NOT NULL DEFAULT ''")?;
    ensure_column(conn, "user_profile", "gender", "TEXT NOT NULL DEFAULT ''")?;
    Ok(())
}

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<(), String> {
    if !column_exists(conn, table, column)? {
        conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"), [])
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
        for (index, card_type) in ["todo-overview", "today-focus", "recent-essays", "quick-tools"]
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

#[tauri::command]
fn workspace_snapshot(state: State<AppState>) -> Result<WorkspaceSnapshot, String> {
    let conn = open_db(&state)?;
    Ok(WorkspaceSnapshot {
        profile: read_profile(&conn)?,
        projects: read_projects(&conn)?,
        tasks: read_tasks(&conn)?,
        essays: read_essays(&conn)?,
        essay_categories: read_essay_categories(&conn)?,
        conversations: read_conversations(&conn)?,
        messages: read_messages(&conn)?,
        dashboard_cards: read_dashboard_cards(&conn)?,
        settings: read_settings(&conn)?,
    })
}

#[tauri::command]
fn workspace_path(state: State<AppState>) -> Result<String, String> {
    Ok(state.db_path.to_string_lossy().to_string())
}

#[tauri::command]
fn profile_update(state: State<AppState>, profile: ProfilePatch) -> Result<UserProfile, String> {
    let conn = open_db(&state)?;
    let current = read_profile(&conn)?;
    let updated = UserProfile {
        id: current.id,
        local_user_key: current.local_user_key,
        nickname: profile.nickname.unwrap_or(current.nickname),
        avatar_url: profile.avatar_url.unwrap_or(current.avatar_url),
        phone: profile.phone.unwrap_or(current.phone),
        email: profile.email.unwrap_or(current.email),
        age: profile.age.unwrap_or(current.age),
        personality: profile.personality.unwrap_or(current.personality),
        gender: profile.gender.unwrap_or(current.gender),
        phone_bound: false,
        email_bound: false,
        login_provider: profile.login_provider.unwrap_or(current.login_provider),
        oauth_provider: profile.oauth_provider.or(current.oauth_provider),
        created_at: current.created_at,
        updated_at: now(),
    };
    let phone_bound = !updated.phone.trim().is_empty();
    let email_bound = !updated.email.trim().is_empty();
    conn.execute(
        "UPDATE user_profile SET nickname = ?1, avatar_url = ?2, phone = ?3, email = ?4,
        age = ?5, personality = ?6, gender = ?7, phone_bound = ?8, email_bound = ?9,
        login_provider = ?10, oauth_provider = ?11, updated_at = ?12 WHERE id = ?13",
        params![
            updated.nickname,
            updated.avatar_url,
            updated.phone,
            updated.email,
            updated.age,
            updated.personality,
            updated.gender,
            phone_bound as i64,
            email_bound as i64,
            updated.login_provider,
            updated.oauth_provider,
            updated.updated_at,
            updated.id
        ],
    )
    .map_err(|error| error.to_string())?;
    read_profile(&conn)
}

#[tauri::command]
fn project_create(state: State<AppState>, project: ProjectPatch) -> Result<Project, String> {
    let conn = open_db(&state)?;
    let id = new_id();
    let timestamp = now();
    conn.execute(
        "INSERT INTO projects (id, name, color, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?4)",
        params![
            id,
            project.name.unwrap_or_else(|| "新项目".to_string()),
            project.color.unwrap_or_else(|| "#2563eb".to_string()),
            timestamp
        ],
    )
    .map_err(|error| error.to_string())?;
    read_project(&conn, &id)
}

#[tauri::command]
fn project_update(state: State<AppState>, project: ProjectPatch) -> Result<Project, String> {
    let conn = open_db(&state)?;
    let id = project.id.ok_or_else(|| "项目 id 不能为空".to_string())?;
    let current = read_project(&conn, &id)?;
    conn.execute(
        "UPDATE projects SET name = ?1, color = ?2, archived_at = ?3, updated_at = ?4 WHERE id = ?5",
        params![
            project.name.unwrap_or(current.name),
            project.color.unwrap_or(current.color),
            project.archived_at.or(current.archived_at),
            now(),
            id
        ],
    )
    .map_err(|error| error.to_string())?;
    read_project(&conn, &id)
}

#[tauri::command]
fn project_archive(state: State<AppState>, id: String) -> Result<Project, String> {
    let conn = open_db(&state)?;
    let active_task_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM tasks WHERE project_id = ?1 AND archived_at IS NULL",
            params![id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if active_task_count > 0 {
        return Err("该项目仍有关联任务，请先转移或清空关联任务。".to_string());
    }
    drop(conn);
    project_update(
        state,
        ProjectPatch {
            id: Some(id),
            name: None,
            color: None,
            archived_at: Some(now()),
        },
    )
}

#[tauri::command]
fn task_create(state: State<AppState>, task: TaskPatch) -> Result<Task, String> {
    let conn = open_db(&state)?;
    let timestamp = now();
    let id = new_id();
    let labels = serde_json::to_string(&task.labels.unwrap_or_default()).map_err(|error| error.to_string())?;
    let order_num: i64 = conn
        .query_row("SELECT COALESCE(MAX(order_num), 0) + 1 FROM tasks", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    conn.execute(
        "INSERT INTO tasks
        (id, title, description, type, priority, status, project_id, labels, due_date, progress, parent_id, order_num, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)",
        params![
            id,
            task.title.unwrap_or_else(|| "未命名任务".to_string()),
            task.description.unwrap_or_default(),
            task.task_type.unwrap_or_else(|| "personal".to_string()),
            task.priority.unwrap_or_else(|| "P2".to_string()),
            task.status.unwrap_or_else(|| "todo".to_string()),
            empty_to_none(task.project_id),
            labels,
            task.due_date.unwrap_or_default(),
            task.progress.unwrap_or(0).clamp(0, 100),
            empty_to_none(task.parent_id),
            order_num,
            timestamp
        ],
    )
    .map_err(|error| error.to_string())?;
    read_task(&conn, &id)
}

#[tauri::command]
fn task_update(state: State<AppState>, task: TaskPatch) -> Result<Task, String> {
    let conn = open_db(&state)?;
    let id = task.id.ok_or_else(|| "任务 id 不能为空".to_string())?;
    let current = read_task(&conn, &id)?;
    let labels = serde_json::to_string(&task.labels.unwrap_or(current.labels)).map_err(|error| error.to_string())?;
    let next_project_id = match task.project_id {
        Some(value) if value.trim().is_empty() => None,
        Some(value) => Some(value.trim().to_string()),
        None => current.project_id,
    };
    let next_parent_id = match task.parent_id {
        Some(value) if value.trim().is_empty() => None,
        Some(value) => Some(value.trim().to_string()),
        None => current.parent_id,
    };
    conn.execute(
        "UPDATE tasks SET title = ?1, description = ?2, type = ?3, priority = ?4, status = ?5,
        project_id = ?6, labels = ?7, due_date = ?8, progress = ?9, parent_id = ?10, archived_at = ?11, updated_at = ?12
        WHERE id = ?13",
        params![
            task.title.unwrap_or(current.title),
            task.description.unwrap_or(current.description),
            task.task_type.unwrap_or(current.task_type),
            task.priority.unwrap_or(current.priority),
            task.status.unwrap_or(current.status),
            next_project_id,
            labels,
            task.due_date.unwrap_or(current.due_date),
            task.progress.unwrap_or(current.progress).clamp(0, 100),
            next_parent_id,
            task.archived_at.or(current.archived_at),
            now(),
            id
        ],
    )
    .map_err(|error| error.to_string())?;
    read_task(&conn, &id)
}

#[tauri::command]
fn task_move(state: State<AppState>, id: String, status: String) -> Result<Task, String> {
    task_update(
        state,
        TaskPatch {
            id: Some(id),
            status: Some(status),
            title: None,
            description: None,
            task_type: None,
            priority: None,
            project_id: None,
            labels: None,
            due_date: None,
            progress: None,
            parent_id: None,
            archived_at: None,
        },
    )
}

#[tauri::command]
fn task_archive(state: State<AppState>, id: String) -> Result<Task, String> {
    task_update(
        state,
        TaskPatch {
            id: Some(id),
            archived_at: Some(now()),
            title: None,
            description: None,
            task_type: None,
            priority: None,
            status: None,
            project_id: None,
            labels: None,
            due_date: None,
            progress: None,
            parent_id: None,
        },
    )
}

#[tauri::command]
fn essay_category_create(state: State<AppState>, category: EssayCategoryPatch) -> Result<EssayCategory, String> {
    let conn = open_db(&state)?;
    let id = new_id();
    let timestamp = now();
    let order_num: i64 = conn
        .query_row("SELECT COALESCE(MAX(order_num), 0) + 1 FROM essay_categories", [], |row| row.get(0))
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
fn essay_category_update(state: State<AppState>, category: EssayCategoryPatch) -> Result<EssayCategory, String> {
    let conn = open_db(&state)?;
    let id = category.id.ok_or_else(|| "随笔分类 id 不能为空".to_string())?;
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
fn essay_category_archive(state: State<AppState>, id: String) -> Result<EssayCategory, String> {
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
fn essay_create(state: State<AppState>, essay: EssayPatch) -> Result<Essay, String> {
    let conn = open_db(&state)?;
    let timestamp = now();
    let id = new_id();
    let tags = serde_json::to_string(&essay.tags.unwrap_or_default()).map_err(|error| error.to_string())?;
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
fn essay_update(state: State<AppState>, essay: EssayPatch) -> Result<Essay, String> {
    let conn = open_db(&state)?;
    let id = essay.id.ok_or_else(|| "随笔 id 不能为空".to_string())?;
    let current = read_essay(&conn, &id)?;
    let tags = serde_json::to_string(&essay.tags.unwrap_or(current.tags)).map_err(|error| error.to_string())?;
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
fn essay_archive(state: State<AppState>, id: String) -> Result<Essay, String> {
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
fn settings_update(state: State<AppState>, settings: SettingsPatch) -> Result<Settings, String> {
    let conn = open_db(&state)?;
    let current = read_settings(&conn)?;
    let next = Settings {
        ai_provider: settings.ai_provider.unwrap_or(current.ai_provider),
        ai_base_url: settings.ai_base_url.unwrap_or(current.ai_base_url),
        ai_model: settings.ai_model.unwrap_or(current.ai_model),
        ai_api_key: settings.ai_api_key.unwrap_or(current.ai_api_key),
        theme_mode: settings.theme_mode.unwrap_or(current.theme_mode),
        language: settings.language.unwrap_or(current.language),
        font_size: settings.font_size.unwrap_or(current.font_size),
        workspace_path: settings.workspace_path.unwrap_or(current.workspace_path),
        send_message_shortcut: settings.send_message_shortcut.unwrap_or(current.send_message_shortcut),
        global_search_shortcut: settings.global_search_shortcut.unwrap_or(current.global_search_shortcut),
        new_task_shortcut: settings.new_task_shortcut.unwrap_or(current.new_task_shortcut),
        new_essay_shortcut: settings.new_essay_shortcut.unwrap_or(current.new_essay_shortcut),
    };
    for (key, value) in [
        ("aiProvider", next.ai_provider.as_str()),
        ("aiBaseUrl", next.ai_base_url.as_str()),
        ("aiModel", next.ai_model.as_str()),
        ("aiApiKey", next.ai_api_key.as_str()),
        ("themeMode", next.theme_mode.as_str()),
        ("language", next.language.as_str()),
        ("fontSize", next.font_size.as_str()),
        ("workspacePath", next.workspace_path.as_str()),
        ("sendMessageShortcut", next.send_message_shortcut.as_str()),
        ("globalSearchShortcut", next.global_search_shortcut.as_str()),
        ("newTaskShortcut", next.new_task_shortcut.as_str()),
        ("newEssayShortcut", next.new_essay_shortcut.as_str()),
    ] {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|error| error.to_string())?;
    }
    read_settings(&conn)
}

#[tauri::command]
async fn chat_send(
    state: State<'_, AppState>,
    content: String,
    conversation_id: Option<String>,
) -> Result<ChatSendResult, String> {
    let conn = open_db(&state)?;
    let timestamp = now();
    let conversation = match conversation_id {
        Some(id) => read_conversation(&conn, &id)?.unwrap_or_else(|| AiConversation {
            id,
            title: content.chars().take(24).collect(),
            archived_at: None,
            created_at: timestamp.clone(),
            updated_at: timestamp.clone(),
        }),
        None => AiConversation {
            id: new_id(),
            title: content.chars().take(24).collect(),
            archived_at: None,
            created_at: timestamp.clone(),
            updated_at: timestamp.clone(),
        },
    };
    conn.execute(
        "INSERT INTO ai_conversations (id, title, archived_at, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at",
        params![
            conversation.id,
            conversation.title,
            conversation.archived_at,
            conversation.created_at,
            now()
        ],
    )
    .map_err(|error| error.to_string())?;

    let user_message = AiMessage {
        id: new_id(),
        conversation_id: conversation.id.clone(),
        role: "user".to_string(),
        content: content.clone(),
        created_at: now(),
    };
    insert_message(&conn, &user_message)?;

    let settings = read_settings(&conn)?;
    let reply = model_reply(&settings, &read_recent_messages(&conn, &conversation.id, 10)?, &content).await;
    let assistant_message = AiMessage {
        id: new_id(),
        conversation_id: conversation.id.clone(),
        role: "assistant".to_string(),
        content: reply,
        created_at: now(),
    };
    insert_message(&conn, &assistant_message)?;

    let conversation = read_conversation(&conn, &conversation.id)?.ok_or_else(|| "会话不存在".to_string())?;
    Ok(ChatSendResult {
        conversation,
        messages: vec![user_message, assistant_message],
    })
}

async fn model_reply(settings: &Settings, messages: &[AiMessage], content: &str) -> String {
    if settings.ai_provider != "openai-compatible" || settings.ai_api_key.trim().is_empty() {
        return format!(
            "已收到：{}\n\n当前处于本地 mock 模式。配置 OpenAI-compatible API Key 后，会使用最近 10 轮上下文请求真实模型。",
            content
        );
    }

    let payload = json!({
        "model": settings.ai_model,
        "messages": messages.iter().map(|message| {
            json!({"role": message.role, "content": message.content})
        }).collect::<Vec<_>>()
    });

    let response = reqwest::Client::new()
        .post(&settings.ai_base_url)
        .bearer_auth(&settings.ai_api_key)
        .json(&payload)
        .send()
        .await;

    match response {
        Ok(resp) => match resp.json::<serde_json::Value>().await {
            Ok(value) => value["choices"][0]["message"]["content"]
                .as_str()
                .unwrap_or("模型返回为空。")
                .to_string(),
            Err(error) => format!("模型响应解析失败：{}", error),
        },
        Err(error) => format!("模型请求失败：{}", error),
    }
}

fn read_profile(conn: &Connection) -> Result<UserProfile, String> {
    conn.query_row(
        "SELECT id, local_user_key, nickname, avatar_url, phone, email, age, personality, gender,
        phone_bound, email_bound, login_provider, oauth_provider, created_at, updated_at FROM user_profile LIMIT 1",
        [],
        |row| {
            Ok(UserProfile {
                id: row.get(0)?,
                local_user_key: row.get(1)?,
                nickname: row.get(2)?,
                avatar_url: row.get(3)?,
                phone: row.get(4)?,
                email: row.get(5)?,
                age: row.get(6)?,
                personality: row.get(7)?,
                gender: row.get(8)?,
                phone_bound: row.get::<_, i64>(9)? == 1,
                email_bound: row.get::<_, i64>(10)? == 1,
                login_provider: row.get(11)?,
                oauth_provider: row.get(12)?,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        },
    )
    .map_err(|error| error.to_string())
}

fn read_project(conn: &Connection, id: &str) -> Result<Project, String> {
    conn.query_row(
        "SELECT id, name, color, archived_at, created_at, updated_at FROM projects WHERE id = ?1",
        params![id],
        map_project,
    )
    .map_err(|error| error.to_string())
}

fn read_projects(conn: &Connection) -> Result<Vec<Project>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, color, archived_at, created_at, updated_at FROM projects ORDER BY updated_at DESC")
        .map_err(|error| error.to_string())?;
    let projects = stmt
        .query_map([], map_project)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(projects)
}

fn map_project(row: &rusqlite::Row) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
        archived_at: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn read_task(conn: &Connection, id: &str) -> Result<Task, String> {
    conn.query_row(
        "SELECT id, title, description, type, priority, status, project_id, labels, due_date, progress,
        parent_id, order_num, archived_at, created_at, updated_at FROM tasks WHERE id = ?1",
        params![id],
        map_task,
    )
    .map_err(|error| error.to_string())
}

fn read_tasks(conn: &Connection) -> Result<Vec<Task>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, title, description, type, priority, status, project_id, labels, due_date, progress,
            parent_id, order_num, archived_at, created_at, updated_at FROM tasks ORDER BY order_num ASC, updated_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let tasks = stmt
        .query_map([], map_task)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(tasks)
}

fn map_task(row: &rusqlite::Row) -> rusqlite::Result<Task> {
    let labels: String = row.get(7)?;
    Ok(Task {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        task_type: row.get(3)?,
        priority: row.get(4)?,
        status: row.get(5)?,
        project_id: row.get(6)?,
        labels: serde_json::from_str(&labels).unwrap_or_default(),
        due_date: row.get(8)?,
        progress: row.get(9)?,
        parent_id: row.get(10)?,
        order_num: row.get(11)?,
        archived_at: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

fn read_essay_category(conn: &Connection, id: &str) -> Result<EssayCategory, String> {
    conn.query_row(
        "SELECT id, name, color, order_num, archived_at, created_at, updated_at FROM essay_categories WHERE id = ?1",
        params![id],
        map_essay_category,
    )
    .map_err(|error| error.to_string())
}

fn read_essay_categories(conn: &Connection) -> Result<Vec<EssayCategory>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, color, order_num, archived_at, created_at, updated_at FROM essay_categories ORDER BY order_num ASC, updated_at DESC")
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

fn read_essay(conn: &Connection, id: &str) -> Result<Essay, String> {
    conn.query_row(
        "SELECT id, title, content, summary, category_id, tags, status, archived_at, created_at, updated_at FROM notes WHERE id = ?1",
        params![id],
        map_essay,
    )
    .map_err(|error| error.to_string())
}

fn read_essays(conn: &Connection) -> Result<Vec<Essay>, String> {
    let mut stmt = conn
        .prepare("SELECT id, title, content, summary, category_id, tags, status, archived_at, created_at, updated_at FROM notes ORDER BY updated_at DESC")
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

fn read_conversation(conn: &Connection, id: &str) -> Result<Option<AiConversation>, String> {
    conn.query_row(
        "SELECT id, title, archived_at, created_at, updated_at FROM ai_conversations WHERE id = ?1",
        params![id],
        map_conversation,
    )
    .optional()
    .map_err(|error| error.to_string())
}

fn read_conversations(conn: &Connection) -> Result<Vec<AiConversation>, String> {
    let mut stmt = conn
        .prepare("SELECT id, title, archived_at, created_at, updated_at FROM ai_conversations ORDER BY updated_at DESC")
        .map_err(|error| error.to_string())?;
    let conversations = stmt
        .query_map([], map_conversation)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(conversations)
}

fn map_conversation(row: &rusqlite::Row) -> rusqlite::Result<AiConversation> {
    Ok(AiConversation {
        id: row.get(0)?,
        title: row.get(1)?,
        archived_at: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn insert_message(conn: &Connection, message: &AiMessage) -> Result<(), String> {
    conn.execute(
        "INSERT INTO ai_messages (id, conversation_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![message.id, message.conversation_id, message.role, message.content, message.created_at],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn read_messages(conn: &Connection) -> Result<Vec<AiMessage>, String> {
    let mut stmt = conn
        .prepare("SELECT id, conversation_id, role, content, created_at FROM ai_messages ORDER BY created_at ASC")
        .map_err(|error| error.to_string())?;
    let messages = stmt
        .query_map([], map_message)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(messages)
}

fn read_recent_messages(conn: &Connection, conversation_id: &str, limit: i64) -> Result<Vec<AiMessage>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, conversation_id, role, content, created_at FROM ai_messages
            WHERE conversation_id = ?1 ORDER BY created_at DESC LIMIT ?2",
        )
        .map_err(|error| error.to_string())?;
    let mut messages = stmt
        .query_map(params![conversation_id, limit], map_message)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    messages.reverse();
    Ok(messages)
}

fn map_message(row: &rusqlite::Row) -> rusqlite::Result<AiMessage> {
    Ok(AiMessage {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        role: row.get(2)?,
        content: row.get(3)?,
        created_at: row.get(4)?,
    })
}

fn read_dashboard_cards(conn: &Connection) -> Result<Vec<DashboardCard>, String> {
    let mut stmt = conn
        .prepare("SELECT id, card_type, card_config, is_visible, order_num FROM dashboard_cards ORDER BY order_num ASC")
        .map_err(|error| error.to_string())?;
    let cards = stmt
        .query_map([], |row| {
        let config: String = row.get(2)?;
        Ok(DashboardCard {
            id: row.get(0)?,
            card_type: row.get(1)?,
            card_config: serde_json::from_str(&config).unwrap_or_else(|_| json!({})),
            is_visible: row.get::<_, i64>(3)? == 1,
            order_num: row.get(4)?,
        })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(cards)
}

fn read_settings(conn: &Connection) -> Result<Settings, String> {
    let get = |key: &str, default_value: &str| -> Result<String, String> {
        conn.query_row("SELECT value FROM settings WHERE key = ?1", params![key], |row| row.get(0))
            .optional()
            .map_err(|error| error.to_string())
            .map(|value| value.unwrap_or_else(|| default_value.to_string()))
    };
    let theme_mode = get("themeMode", "light")?;
    let theme_mode = if theme_mode == "dark" { "dark" } else { "light" }.to_string();
    Ok(Settings {
        ai_provider: get("aiProvider", "mock")?,
        ai_base_url: get("aiBaseUrl", "https://api.openai.com/v1/chat/completions")?,
        ai_model: get("aiModel", "gpt-4.1-mini")?,
        ai_api_key: get("aiApiKey", "")?,
        theme_mode,
        language: get("language", "zh-CN")?,
        font_size: get("fontSize", "default")?,
        workspace_path: get("workspacePath", "")?,
        send_message_shortcut: get("sendMessageShortcut", "Enter")?,
        global_search_shortcut: get("globalSearchShortcut", "Ctrl+K")?,
        new_task_shortcut: get("newTaskShortcut", "Ctrl+Shift+T")?,
        new_essay_shortcut: get("newEssayShortcut", "Ctrl+Shift+N")?,
    })
}

fn empty_to_none(value: Option<String>) -> Option<String> {
    value.and_then(|item| {
        let trimmed = item.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn app_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("workspace.sqlite"))
}

fn configure_main_window(app: &tauri::App) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    let monitor = window
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .or(window.current_monitor().map_err(|error| error.to_string())?);

    if let Some(monitor) = monitor {
        let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
        let monitor_size = monitor.size();
        let screen_width = f64::from(monitor_size.width) / scale_factor;
        let target_width = (screen_width * 0.75).round().max(960.0);

        window
            .set_size(Size::Logical(LogicalSize {
                width: target_width,
                height: 820.0,
            }))
            .map_err(|error| error.to_string())?;
    }

    window.center().map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            configure_main_window(app)?;
            let db_path = app_db_path(app.handle())?;
            init_db(&db_path)?;
            app.manage(AppState { db_path });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workspace_snapshot,
            workspace_path,
            profile_update,
            project_create,
            project_update,
            project_archive,
            task_create,
            task_update,
            task_move,
            task_archive,
            essay_category_create,
            essay_category_update,
            essay_category_archive,
            essay_create,
            essay_update,
            essay_archive,
            settings_update,
            chat_send
        ])
        .run(tauri::generate_context!())
        .expect("failed to run app");
}
