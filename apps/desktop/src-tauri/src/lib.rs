use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Same DDL the browser (sql.js) path runs — single source of truth in
    // apps/desktop/src/lib/db/schema.sql. Mirrors @stockflow/core's schema.
    let migrations = vec![Migration {
        version: 1,
        description: "init local schema",
        sql: include_str!("../../src/lib/db/schema.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:pharmastock.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
