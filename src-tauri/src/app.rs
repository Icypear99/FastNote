use tauri::{LogicalSize, Manager, Size};

use crate::database::{app_db_path, init_db};
use crate::features::{chat, essays, profile, projects, settings, tasks, workspace};
use crate::state::AppState;

pub(crate) fn run() {
    tauri::Builder::default()
        .setup(|app| {
            configure_main_window(app)?;
            let db_path = app_db_path(app.handle())?;
            init_db(&db_path)?;
            app.manage(AppState { db_path });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workspace::workspace_snapshot,
            workspace::workspace_path,
            profile::profile_update,
            projects::project_create,
            projects::project_update,
            projects::project_archive,
            projects::project_restore,
            tasks::task_create,
            tasks::task_update,
            tasks::task_move,
            tasks::tasks_reorder,
            tasks::task_archive,
            tasks::task_restore,
            essays::essay_category_create,
            essays::essay_category_update,
            essays::essay_category_archive,
            essays::essay_create,
            essays::essay_update,
            essays::essay_archive,
            essays::essay_restore,
            settings::settings_update,
            chat::chat_send
        ])
        .run(tauri::generate_context!())
        .expect("failed to run app");
}

fn configure_main_window(app: &tauri::App) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    let monitor = window
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .or(window
            .current_monitor()
            .map_err(|error| error.to_string())?);

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
