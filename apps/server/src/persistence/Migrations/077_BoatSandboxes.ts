import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS boat_sandboxes (
      sandbox_id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      status TEXT NOT NULL,
      host_url TEXT,
      ws_base_url TEXT,
      server_port INTEGER NOT NULL,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
});
