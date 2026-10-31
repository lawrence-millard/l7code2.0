import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // Cursor-style Projects: shared notes + membership, distinct from folder projects.
  yield* sql`
    CREATE TABLE IF NOT EXISTS agent_projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS agent_project_threads (
      project_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      environment_id TEXT,
      linked_at TEXT NOT NULL,
      PRIMARY KEY (project_id, thread_id),
      FOREIGN KEY (project_id) REFERENCES agent_projects(id) ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS agent_project_folders (
      project_id TEXT NOT NULL,
      folder_project_id TEXT NOT NULL,
      linked_at TEXT NOT NULL,
      PRIMARY KEY (project_id, folder_project_id),
      FOREIGN KEY (project_id) REFERENCES agent_projects(id) ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS agent_project_workstreams (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      thread_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES agent_projects(id) ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS agent_project_workstreams_project_idx
      ON agent_project_workstreams (project_id, sort_order, id)
  `;
});
