use rusqlite::Connection;
use serde_json::json;
use tauri::State;

use crate::features::chat::{read_conversations, read_messages};
use crate::features::essays::{read_essay_categories, read_essays};
use crate::features::profile::read_profile;
use crate::features::projects::read_projects;
use crate::features::settings::read_settings;
use crate::features::tasks::read_tasks;
use crate::models::{DashboardCard, WorkspaceSnapshot};
use crate::state::{open_db, AppState};

#[tauri::command]
pub(crate) fn workspace_snapshot(state: State<AppState>) -> Result<WorkspaceSnapshot, String> {
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
pub(crate) fn workspace_path(state: State<AppState>) -> Result<String, String> {
    Ok(state.db_path.to_string_lossy().to_string())
}

fn read_dashboard_cards(conn: &Connection) -> Result<Vec<DashboardCard>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, card_type, card_config, is_visible, order_num FROM dashboard_cards ORDER BY order_num ASC",
        )
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
