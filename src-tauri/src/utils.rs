use chrono::Utc;
use uuid::Uuid;

pub(crate) fn now() -> String {
    Utc::now().to_rfc3339()
}

pub(crate) fn new_id() -> String {
    Uuid::new_v4().to_string()
}

pub(crate) fn empty_to_none(value: Option<String>) -> Option<String> {
    value.and_then(|item| {
        let trimmed = item.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}
