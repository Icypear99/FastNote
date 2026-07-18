use rusqlite::{params, Connection};
use tauri::State;

use crate::models::{Project, ProjectPatch};
use crate::state::{open_db, AppState};
use crate::utils::{new_id, now};

#[tauri::command]
pub(crate) fn project_create(
    state: State<AppState>,
    project: ProjectPatch,
) -> Result<Project, String> {
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
pub(crate) fn project_update(
    state: State<AppState>,
    project: ProjectPatch,
) -> Result<Project, String> {
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

pub(crate) fn archive_project_record(conn: &Connection, id: &str) -> Result<Project, String> {
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
    let updated = conn
        .execute(
            "UPDATE projects SET archived_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![now(), id],
        )
        .map_err(|error| error.to_string())?;
    if updated == 0 {
        return Err("项目不存在".to_string());
    }
    read_project(conn, id)
}

#[tauri::command]
pub(crate) fn project_archive(state: State<AppState>, id: String) -> Result<Project, String> {
    let conn = open_db(&state)?;
    archive_project_record(&conn, &id)
}

pub(crate) fn restore_project_record(conn: &Connection, id: &str) -> Result<Project, String> {
    let updated = conn
        .execute(
            "UPDATE projects SET archived_at = NULL, updated_at = ?1 WHERE id = ?2",
            params![now(), id],
        )
        .map_err(|error| error.to_string())?;
    if updated == 0 {
        return Err("项目不存在".to_string());
    }
    read_project(conn, id)
}

#[tauri::command]
pub(crate) fn project_restore(state: State<AppState>, id: String) -> Result<Project, String> {
    let conn = open_db(&state)?;
    restore_project_record(&conn, &id)
}

pub(crate) fn read_project(conn: &Connection, id: &str) -> Result<Project, String> {
    conn.query_row(
        "SELECT id, name, color, archived_at, created_at, updated_at FROM projects WHERE id = ?1",
        params![id],
        map_project,
    )
    .map_err(|error| error.to_string())
}

pub(crate) fn read_projects(conn: &Connection) -> Result<Vec<Project>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, color, archived_at, created_at, updated_at FROM projects ORDER BY updated_at DESC",
        )
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
