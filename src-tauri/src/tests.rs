#[cfg(test)]
mod tests {
    use super::*;

    fn migration_connection() -> Connection {
        let connection = Connection::open_in_memory().expect("open test database");
        connection
            .execute_batch(
                "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE essay_categories (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    color TEXT NOT NULL,
                    order_num INTEGER NOT NULL DEFAULT 0,
                    archived_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE notes (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL DEFAULT '',
                    summary TEXT NOT NULL DEFAULT '',
                    category_id TEXT,
                    tags TEXT NOT NULL DEFAULT '[]',
                    status TEXT NOT NULL DEFAULT 'draft',
                    archived_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );",
            )
            .expect("create test schema");
        connection
    }

    fn records_connection() -> Connection {
        let connection = Connection::open_in_memory().expect("open record test database");
        connection
            .execute_batch(
                "CREATE TABLE projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    color TEXT NOT NULL,
                    archived_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE tasks (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    type TEXT NOT NULL DEFAULT 'task',
                    priority TEXT NOT NULL DEFAULT 'P2',
                    status TEXT NOT NULL DEFAULT 'todo',
                    project_id TEXT,
                    labels TEXT NOT NULL DEFAULT '[]',
                    due_date TEXT NOT NULL DEFAULT '',
                    progress INTEGER NOT NULL DEFAULT 0,
                    parent_id TEXT,
                    order_num INTEGER NOT NULL DEFAULT 0,
                    archived_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );",
            )
            .expect("create record test schema");
        connection
    }

    #[test]
    fn project_restore_is_idempotent_and_preserves_fields() {
        let connection = records_connection();
        connection
            .execute(
                "INSERT INTO projects (id, name, color, archived_at, created_at, updated_at)
                VALUES ('project', '重要项目', '#123456', 'deleted', 'created', 'before')",
                [],
            )
            .expect("insert project");

        let first = restore_project_record(&connection, "project").expect("restore project");
        let second = restore_project_record(&connection, "project").expect("restore project again");

        assert_eq!(first.name, "重要项目");
        assert_eq!(first.color, "#123456");
        assert_eq!(first.created_at, "created");
        assert!(first.archived_at.is_none());
        assert!(second.archived_at.is_none());
    }

    #[test]
    fn project_archive_requires_all_related_tasks_to_be_archived() {
        let connection = records_connection();
        connection
            .execute_batch(
                "INSERT INTO projects (id, name, color, created_at, updated_at)
                VALUES ('project', '项目', '#123456', 'created', 'before');
                INSERT INTO tasks (id, title, project_id, created_at, updated_at)
                VALUES ('task', '任务', 'project', 'created', 'before');",
            )
            .expect("insert active project fixture");

        let error = archive_project_record(&connection, "project").unwrap_err();
        assert!(error.contains("仍有关联任务"));
        assert!(read_project(&connection, "project")
            .unwrap()
            .archived_at
            .is_none());

        connection
            .execute(
                "UPDATE tasks SET archived_at = 'deleted' WHERE id = 'task'",
                [],
            )
            .expect("archive related task");
        let archived = archive_project_record(&connection, "project").expect("archive project");
        assert!(archived.archived_at.is_some());
    }

    #[test]
    fn task_archive_unlinks_children_and_restore_preserves_task() {
        let mut connection = records_connection();
        connection
            .execute_batch(
                "INSERT INTO projects (id, name, color, created_at, updated_at)
                VALUES ('project', '项目', '#123456', 'created', 'updated');
                INSERT INTO tasks (id, title, project_id, labels, archived_at, created_at, updated_at)
                VALUES ('parent', '父任务', 'project', '[\"保留\"]', NULL, 'created', 'before');
                INSERT INTO tasks (id, title, project_id, parent_id, created_at, updated_at)
                VALUES ('child', '子任务', 'project', 'parent', 'created', 'before');",
            )
            .expect("insert task hierarchy");

        let archived = archive_task_record(&mut connection, "parent").expect("archive parent");
        let child = read_task(&connection, "child").expect("read child");
        assert!(archived.archived_at.is_some());
        assert!(child.parent_id.is_none());
        assert!(child.archived_at.is_none());

        let restored = restore_task_record(&mut connection, "parent").expect("restore parent");
        assert_eq!(restored.title, "父任务");
        assert_eq!(restored.labels, vec!["保留"]);
        assert_eq!(restored.created_at, "created");
        assert!(restored.archived_at.is_none());
    }

    #[test]
    fn task_restore_requires_an_active_project() {
        let mut connection = records_connection();
        connection
            .execute_batch(
                "INSERT INTO projects (id, name, color, archived_at, created_at, updated_at)
                VALUES ('project', '项目', '#123456', 'deleted', 'created', 'updated');
                INSERT INTO tasks (id, title, project_id, archived_at, created_at, updated_at)
                VALUES ('task', '任务', 'project', 'deleted', 'created', 'updated'),
                       ('orphan', '孤立任务', 'missing', 'deleted', 'created', 'updated');",
            )
            .expect("insert archived records");

        let archived_project_error = restore_task_record(&mut connection, "task").unwrap_err();
        assert!(archived_project_error.contains("请先恢复项目"));
        let missing_project_error = restore_task_record(&mut connection, "orphan").unwrap_err();
        assert!(missing_project_error.contains("项目不存在"));

        restore_project_record(&connection, "project").expect("restore project");
        let restored = restore_task_record(&mut connection, "task").expect("restore task");
        assert!(restored.archived_at.is_none());
        assert_eq!(restored.project_id.as_deref(), Some("project"));
    }

    #[test]
    fn task_restore_clears_an_unavailable_parent() {
        let mut connection = records_connection();
        connection
            .execute_batch(
                "INSERT INTO projects (id, name, color, created_at, updated_at)
                VALUES ('project', '项目', '#123456', 'created', 'updated');
                INSERT INTO tasks (id, title, project_id, archived_at, created_at, updated_at)
                VALUES ('parent', '父任务', 'project', 'deleted', 'created', 'updated');
                INSERT INTO tasks (id, title, project_id, parent_id, archived_at, created_at, updated_at)
                VALUES ('child', '子任务', 'project', 'parent', 'deleted', 'created', 'updated');",
            )
            .expect("insert unavailable parent");

        let restored = restore_task_record(&mut connection, "child").expect("restore child");
        assert!(restored.parent_id.is_none());
        assert!(restored.archived_at.is_none());
    }

    #[test]
    fn task_archive_rolls_back_when_child_unlink_fails() {
        let mut connection = records_connection();
        connection
            .execute_batch(
                "INSERT INTO tasks (id, title, created_at, updated_at)
                VALUES ('parent', '父任务', 'created', 'before');
                INSERT INTO tasks (id, title, parent_id, created_at, updated_at)
                VALUES ('child', '子任务', 'parent', 'created', 'before');
                CREATE TRIGGER prevent_child_unlink
                BEFORE UPDATE OF parent_id ON tasks
                WHEN OLD.parent_id = 'parent' AND NEW.parent_id IS NULL
                BEGIN
                    SELECT RAISE(ABORT, 'cannot unlink child');
                END;",
            )
            .expect("insert rollback fixture");

        assert!(archive_task_record(&mut connection, "parent").is_err());
        let parent = read_task(&connection, "parent").expect("read rolled back parent");
        let child = read_task(&connection, "child").expect("read rolled back child");
        assert!(parent.archived_at.is_none());
        assert_eq!(parent.updated_at, "before");
        assert_eq!(child.parent_id.as_deref(), Some("parent"));
    }

    #[test]
    fn category_tag_migration_is_idempotent_and_preserves_existing_data() {
        let mut connection = migration_connection();
        connection
            .execute(
                "INSERT INTO essay_categories (id, name, color, created_at, updated_at)
                VALUES (?1, '未分类', '', 'created', 'updated'), ('ideas', '灵感', '', 'created', 'updated')",
                params![DEFAULT_CATEGORY_ID],
            )
            .expect("insert categories");
        connection
            .execute_batch(
                "INSERT INTO notes (id, title, category_id, tags, created_at, updated_at)
                VALUES ('default-note', 'Default', 'default-essay-category', '[]', 'created', 'unchanged'),
                       ('idea-note', 'Idea', 'ideas', '[\"已有\"]', 'created', 'unchanged'),
                       ('deduped-note', 'Deduped', 'ideas', '[\"灵感\"]', 'created', 'unchanged');",
            )
            .expect("insert notes");

        migrate_essay_categories_to_tags(&mut connection).expect("run migration");
        migrate_essay_categories_to_tags(&mut connection).expect("rerun migration");

        let idea_tags: String = connection
            .query_row("SELECT tags FROM notes WHERE id = 'idea-note'", [], |row| {
                row.get(0)
            })
            .expect("read migrated tags");
        assert_eq!(
            serde_json::from_str::<Vec<String>>(&idea_tags).unwrap(),
            vec!["已有", "灵感"]
        );
        let default_tags: String = connection
            .query_row(
                "SELECT tags FROM notes WHERE id = 'default-note'",
                [],
                |row| row.get(0),
            )
            .expect("read default tags");
        assert_eq!(default_tags, "[]");
        let deduped_tags: String = connection
            .query_row(
                "SELECT tags FROM notes WHERE id = 'deduped-note'",
                [],
                |row| row.get(0),
            )
            .expect("read deduped tags");
        assert_eq!(
            serde_json::from_str::<Vec<String>>(&deduped_tags).unwrap(),
            vec!["灵感"]
        );
        let updated_at: String = connection
            .query_row(
                "SELECT updated_at FROM notes WHERE id = 'idea-note'",
                [],
                |row| row.get(0),
            )
            .expect("read timestamp");
        assert_eq!(updated_at, "unchanged");
    }

    #[test]
    fn category_tag_migration_rolls_back_on_invalid_tag_data() {
        let mut connection = migration_connection();
        connection
            .execute_batch(
                "INSERT INTO essay_categories (id, name, color, created_at, updated_at)
                VALUES ('ideas', '灵感', '', 'created', 'updated');
                INSERT INTO notes (id, title, category_id, tags, created_at, updated_at)
                VALUES ('a-valid', 'Valid', 'ideas', '[\"已有\"]', 'created', 'updated'),
                       ('b-invalid', 'Invalid', 'ideas', 'not-json', 'created', 'updated');",
            )
            .expect("insert migration fixtures");

        assert!(migrate_essay_categories_to_tags(&mut connection).is_err());
        let tags: String = connection
            .query_row("SELECT tags FROM notes WHERE id = 'a-valid'", [], |row| {
                row.get(0)
            })
            .expect("read rolled back tags");
        assert_eq!(tags, "[\"已有\"]");
        let marker_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM settings WHERE key = ?1",
                params![ESSAY_CATEGORY_TAG_MIGRATION_KEY],
                |row| row.get(0),
            )
            .expect("read migration marker");
        assert_eq!(marker_count, 0);
    }
}
