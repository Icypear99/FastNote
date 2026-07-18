use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

use crate::models::{Task, TaskPatch, TaskPlacement};
use crate::state::{open_db, AppState};
use crate::utils::{empty_to_none, new_id, now};

#[tauri::command]
pub(crate) fn task_create(state: State<AppState>, task: TaskPatch) -> Result<Task, String> {
    let conn = open_db(&state)?;
    let timestamp = now();
    let id = new_id();
    let labels = serde_json::to_string(&task.labels.unwrap_or_default())
        .map_err(|error| error.to_string())?;
    let order_num: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(order_num), 0) + 1 FROM tasks",
            [],
            |row| row.get(0),
        )
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
pub(crate) fn task_update(state: State<AppState>, task: TaskPatch) -> Result<Task, String> {
    let conn = open_db(&state)?;
    let id = task.id.ok_or_else(|| "任务 id 不能为空".to_string())?;
    let current = read_task(&conn, &id)?;
    let labels = serde_json::to_string(&task.labels.unwrap_or(current.labels))
        .map_err(|error| error.to_string())?;
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
pub(crate) fn task_move(
    state: State<AppState>,
    id: String,
    status: String,
) -> Result<Task, String> {
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
pub(crate) fn tasks_reorder(
    state: State<AppState>,
    placements: Vec<TaskPlacement>,
) -> Result<(), String> {
    let mut conn = open_db(&state)?;
    let transaction = conn.transaction().map_err(|error| error.to_string())?;
    let timestamp = now();
    for placement in placements {
        let updated = transaction
            .execute(
                "UPDATE tasks SET status = ?1, due_date = ?2, order_num = ?3, updated_at = ?4 WHERE id = ?5",
                params![
                    placement.status,
                    placement.due_date,
                    placement.order_num,
                    timestamp,
                    placement.id
                ],
            )
            .map_err(|error| error.to_string())?;
        if updated == 0 {
            return Err("待排序任务不存在".to_string());
        }
    }
    transaction.commit().map_err(|error| error.to_string())
}

pub(crate) fn archive_task_record(conn: &mut Connection, id: &str) -> Result<Task, String> {
    let transaction = conn.transaction().map_err(|error| error.to_string())?;
    let timestamp = now();
    let updated = transaction
        .execute(
            "UPDATE tasks SET archived_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![timestamp, id],
        )
        .map_err(|error| error.to_string())?;
    if updated == 0 {
        return Err("任务不存在".to_string());
    }
    transaction
        .execute(
            "UPDATE tasks SET parent_id = NULL, updated_at = ?1 WHERE parent_id = ?2",
            params![timestamp, id],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    read_task(conn, id)
}

pub(crate) fn restore_task_record(conn: &mut Connection, id: &str) -> Result<Task, String> {
    let transaction = conn.transaction().map_err(|error| error.to_string())?;
    let (project_id, parent_id): (Option<String>, Option<String>) = transaction
        .query_row(
            "SELECT project_id, parent_id FROM tasks WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| error.to_string())?;

    if let Some(project_id) = project_id {
        let project_archived_at = transaction
            .query_row(
                "SELECT archived_at FROM projects WHERE id = ?1",
                params![project_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        match project_archived_at {
            None => return Err("任务所属项目不存在，请先处理项目关联。".to_string()),
            Some(Some(_)) => return Err("任务所属项目仍在回收站，请先恢复项目。".to_string()),
            Some(None) => {}
        }
    }

    let restored_parent_id = if let Some(parent_id) = parent_id {
        let parent_archived_at = transaction
            .query_row(
                "SELECT archived_at FROM tasks WHERE id = ?1",
                params![parent_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        match parent_archived_at {
            Some(None) => Some(parent_id),
            _ => None,
        }
    } else {
        None
    };

    transaction
        .execute(
            "UPDATE tasks SET archived_at = NULL, parent_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![restored_parent_id, now(), id],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    read_task(conn, id)
}

#[tauri::command]
pub(crate) fn task_archive(state: State<AppState>, id: String) -> Result<Task, String> {
    let mut conn = open_db(&state)?;
    archive_task_record(&mut conn, &id)
}

#[tauri::command]
pub(crate) fn task_restore(state: State<AppState>, id: String) -> Result<Task, String> {
    let mut conn = open_db(&state)?;
    restore_task_record(&mut conn, &id)
}

pub(crate) fn read_task(conn: &Connection, id: &str) -> Result<Task, String> {
    conn.query_row(
        "SELECT id, title, description, type, priority, status, project_id, labels, due_date, progress,
        parent_id, order_num, archived_at, created_at, updated_at FROM tasks WHERE id = ?1",
        params![id],
        map_task,
    )
    .map_err(|error| error.to_string())
}

pub(crate) fn read_tasks(conn: &Connection) -> Result<Vec<Task>, String> {
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
