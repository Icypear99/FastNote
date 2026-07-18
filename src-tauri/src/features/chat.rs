use rusqlite::{params, Connection, OptionalExtension};
use serde_json::json;
use tauri::State;

use crate::features::settings::read_settings;
use crate::models::{AiConversation, AiMessage, ChatSendResult, Settings};
use crate::state::{open_db, AppState};
use crate::utils::{new_id, now};

#[tauri::command]
pub(crate) async fn chat_send(
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
    let reply = model_reply(
        &settings,
        &read_recent_messages(&conn, &conversation.id, 10)?,
        &content,
    )
    .await;
    let assistant_message = AiMessage {
        id: new_id(),
        conversation_id: conversation.id.clone(),
        role: "assistant".to_string(),
        content: reply,
        created_at: now(),
    };
    insert_message(&conn, &assistant_message)?;

    let conversation =
        read_conversation(&conn, &conversation.id)?.ok_or_else(|| "会话不存在".to_string())?;
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

fn read_conversation(conn: &Connection, id: &str) -> Result<Option<AiConversation>, String> {
    conn.query_row(
        "SELECT id, title, archived_at, created_at, updated_at FROM ai_conversations WHERE id = ?1",
        params![id],
        map_conversation,
    )
    .optional()
    .map_err(|error| error.to_string())
}

pub(crate) fn read_conversations(conn: &Connection) -> Result<Vec<AiConversation>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, title, archived_at, created_at, updated_at FROM ai_conversations ORDER BY updated_at DESC",
        )
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
        params![
            message.id,
            message.conversation_id,
            message.role,
            message.content,
            message.created_at
        ],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

pub(crate) fn read_messages(conn: &Connection) -> Result<Vec<AiMessage>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, conversation_id, role, content, created_at FROM ai_messages ORDER BY created_at ASC",
        )
        .map_err(|error| error.to_string())?;
    let messages = stmt
        .query_map([], map_message)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(messages)
}

fn read_recent_messages(
    conn: &Connection,
    conversation_id: &str,
    limit: i64,
) -> Result<Vec<AiMessage>, String> {
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
