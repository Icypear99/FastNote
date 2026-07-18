#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod database;
mod features;
mod models;
mod state;
mod utils;

fn main() {
    app::run();
}

#[cfg(test)]
use database::{
    migrate_essay_categories_to_tags, DEFAULT_CATEGORY_ID, ESSAY_CATEGORY_TAG_MIGRATION_KEY,
};
#[cfg(test)]
use features::projects::{archive_project_record, read_project, restore_project_record};
#[cfg(test)]
use features::tasks::{archive_task_record, read_task, restore_task_record};
#[cfg(test)]
use rusqlite::{params, Connection};

#[cfg(test)]
include!("tests.rs");
