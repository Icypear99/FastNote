use rusqlite::{params, Connection};
use tauri::State;

use crate::models::{ProfilePatch, UserProfile};
use crate::state::{open_db, AppState};
use crate::utils::now;

#[tauri::command]
pub(crate) fn profile_update(
    state: State<AppState>,
    profile: ProfilePatch,
) -> Result<UserProfile, String> {
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

pub(crate) fn read_profile(conn: &Connection) -> Result<UserProfile, String> {
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
