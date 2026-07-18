use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UserProfile {
    pub(crate) id: String,
    pub(crate) local_user_key: String,
    pub(crate) nickname: String,
    pub(crate) avatar_url: String,
    pub(crate) phone: String,
    pub(crate) email: String,
    pub(crate) age: String,
    pub(crate) personality: String,
    pub(crate) gender: String,
    pub(crate) phone_bound: bool,
    pub(crate) email_bound: bool,
    pub(crate) login_provider: String,
    pub(crate) oauth_provider: Option<String>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Project {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) color: String,
    pub(crate) archived_at: Option<String>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Task {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) description: String,
    #[serde(rename = "type")]
    pub(crate) task_type: String,
    pub(crate) priority: String,
    pub(crate) status: String,
    pub(crate) project_id: Option<String>,
    pub(crate) labels: Vec<String>,
    pub(crate) due_date: String,
    pub(crate) progress: i64,
    pub(crate) parent_id: Option<String>,
    pub(crate) order_num: i64,
    pub(crate) archived_at: Option<String>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EssayCategory {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) color: String,
    pub(crate) order_num: i64,
    pub(crate) archived_at: Option<String>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Essay {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) content: String,
    pub(crate) summary: String,
    pub(crate) category_id: Option<String>,
    pub(crate) tags: Vec<String>,
    pub(crate) status: String,
    pub(crate) archived_at: Option<String>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiConversation {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) archived_at: Option<String>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiMessage {
    pub(crate) id: String,
    pub(crate) conversation_id: String,
    pub(crate) role: String,
    pub(crate) content: String,
    pub(crate) created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DashboardCard {
    pub(crate) id: String,
    pub(crate) card_type: String,
    pub(crate) card_config: serde_json::Value,
    pub(crate) is_visible: bool,
    pub(crate) order_num: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Settings {
    pub(crate) ai_provider: String,
    pub(crate) ai_base_url: String,
    pub(crate) ai_model: String,
    pub(crate) ai_api_key: String,
    pub(crate) theme_mode: String,
    pub(crate) language: String,
    pub(crate) font_size: String,
    pub(crate) workspace_path: String,
    pub(crate) send_message_shortcut: String,
    pub(crate) global_search_shortcut: String,
    pub(crate) new_task_shortcut: String,
    pub(crate) new_essay_shortcut: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceSnapshot {
    pub(crate) profile: UserProfile,
    pub(crate) projects: Vec<Project>,
    pub(crate) tasks: Vec<Task>,
    pub(crate) essays: Vec<Essay>,
    pub(crate) essay_categories: Vec<EssayCategory>,
    pub(crate) conversations: Vec<AiConversation>,
    pub(crate) messages: Vec<AiMessage>,
    pub(crate) dashboard_cards: Vec<DashboardCard>,
    pub(crate) settings: Settings,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProfilePatch {
    pub(crate) nickname: Option<String>,
    pub(crate) avatar_url: Option<String>,
    pub(crate) phone: Option<String>,
    pub(crate) email: Option<String>,
    pub(crate) age: Option<String>,
    pub(crate) personality: Option<String>,
    pub(crate) gender: Option<String>,
    pub(crate) login_provider: Option<String>,
    pub(crate) oauth_provider: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectPatch {
    pub(crate) id: Option<String>,
    pub(crate) name: Option<String>,
    pub(crate) color: Option<String>,
    pub(crate) archived_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TaskPatch {
    pub(crate) id: Option<String>,
    pub(crate) title: Option<String>,
    pub(crate) description: Option<String>,
    #[serde(rename = "type")]
    pub(crate) task_type: Option<String>,
    pub(crate) priority: Option<String>,
    pub(crate) status: Option<String>,
    pub(crate) project_id: Option<String>,
    pub(crate) labels: Option<Vec<String>>,
    pub(crate) due_date: Option<String>,
    pub(crate) progress: Option<i64>,
    pub(crate) parent_id: Option<String>,
    pub(crate) archived_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TaskPlacement {
    pub(crate) id: String,
    pub(crate) status: String,
    pub(crate) due_date: String,
    pub(crate) order_num: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EssayCategoryPatch {
    pub(crate) id: Option<String>,
    pub(crate) name: Option<String>,
    pub(crate) color: Option<String>,
    pub(crate) order_num: Option<i64>,
    pub(crate) archived_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EssayPatch {
    pub(crate) id: Option<String>,
    pub(crate) title: Option<String>,
    pub(crate) content: Option<String>,
    pub(crate) summary: Option<String>,
    pub(crate) category_id: Option<String>,
    pub(crate) tags: Option<Vec<String>>,
    pub(crate) status: Option<String>,
    pub(crate) archived_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SettingsPatch {
    pub(crate) ai_provider: Option<String>,
    pub(crate) ai_base_url: Option<String>,
    pub(crate) ai_model: Option<String>,
    pub(crate) ai_api_key: Option<String>,
    pub(crate) theme_mode: Option<String>,
    pub(crate) language: Option<String>,
    pub(crate) font_size: Option<String>,
    pub(crate) workspace_path: Option<String>,
    pub(crate) send_message_shortcut: Option<String>,
    pub(crate) global_search_shortcut: Option<String>,
    pub(crate) new_task_shortcut: Option<String>,
    pub(crate) new_essay_shortcut: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatSendResult {
    pub(crate) conversation: AiConversation,
    pub(crate) messages: Vec<AiMessage>,
}
