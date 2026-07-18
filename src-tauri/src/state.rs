use std::path::PathBuf;

use rusqlite::Connection;
use tauri::State;

pub(crate) struct AppState {
    pub(crate) db_path: PathBuf,
}

pub(crate) fn open_db(state: &State<AppState>) -> Result<Connection, String> {
    Connection::open(&state.db_path).map_err(|error| error.to_string())
}
