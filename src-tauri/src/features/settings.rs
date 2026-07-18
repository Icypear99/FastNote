use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

use crate::models::{Settings, SettingsPatch};
use crate::state::{open_db, AppState};

#[tauri::command]
pub(crate) fn settings_update(
    state: State<AppState>,
    settings: SettingsPatch,
) -> Result<Settings, String> {
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
        send_message_shortcut: settings
            .send_message_shortcut
            .unwrap_or(current.send_message_shortcut),
        global_search_shortcut: settings
            .global_search_shortcut
            .unwrap_or(current.global_search_shortcut),
        new_task_shortcut: settings
            .new_task_shortcut
            .unwrap_or(current.new_task_shortcut),
        new_essay_shortcut: settings
            .new_essay_shortcut
            .unwrap_or(current.new_essay_shortcut),
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

pub(crate) fn read_settings(conn: &Connection) -> Result<Settings, String> {
    let get = |key: &str, default_value: &str| -> Result<String, String> {
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())
        .map(|value| value.unwrap_or_else(|| default_value.to_string()))
    };
    let theme_mode = get("themeMode", "light")?;
    let theme_mode = if theme_mode == "dark" {
        "dark"
    } else {
        "light"
    }
    .to_string();
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
