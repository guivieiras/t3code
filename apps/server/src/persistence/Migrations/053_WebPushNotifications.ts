import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE web_push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES auth_sessions(session_id) ON DELETE CASCADE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      origin TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE web_push_completions (
      thread_id TEXT PRIMARY KEY,
      run_ordinal INTEGER NOT NULL
    )
  `;
});
