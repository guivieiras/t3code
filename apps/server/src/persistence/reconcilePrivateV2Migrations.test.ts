import { assert, describe, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Migrator from "effect/sql/Migrator";
import * as SqlClient from "effect/sql/SqlClient";

import { migrationManifest, runMigrations } from "./Migrations.ts";
import OrchestrationV2 from "./Migrations/055_OrchestrationV2.ts";
import { PRIVATE_V2_MIGRATION_SLOTS } from "./reconcilePrivateV2Migrations.ts";

const indexesMissingFromPrivateLayout = [
  "idx_orchestration_events_application_high_water",
  "idx_orchestration_events_agent_stream_sequence",
  "orchestration_events_v2_created_threads_idx",
  "orchestration_v2_projection_runs_recovery_idx",
  "orchestration_v2_projection_requests_recovery_idx",
  "orchestration_v2_projection_turn_items_recovery_idx",
  "orchestration_v2_projection_turn_items_thread_run_idx",
  "orchestration_v2_projection_turn_items_shell_pending_idx",
  "orchestration_v2_projection_messages_latest_user_idx",
];

const defaultModelSelection = { instanceId: "codex", model: "gpt-5.5" };

// The private build ran 055's tables as slots 44-52, without main's 044-054 or three index groups.
const seedPrivateLayout = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* runMigrations({ toMigrationInclusive: 43 });
  yield* Migrator.make({})({
    loader: Migrator.fromRecord({ "44_OrchestrationV2": OrchestrationV2 }),
  });
  for (const index of indexesMissingFromPrivateLayout) {
    yield* sql`DROP INDEX ${sql(index)}`;
  }
  for (const [id, name] of PRIVATE_V2_MIGRATION_SLOTS.slice(1)) {
    yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES (${id}, ${name})`;
  }
  yield* sql`CREATE TABLE orchestration_v2_projection_thread_token_usage (thread_id TEXT)`;
  yield* sql`
    INSERT INTO orchestration_v2_legacy_imports
      (thread_id, source_updated_at, shell_imported_at, transcript_imported_at, imported_message_count)
    VALUES ('private-thread', '2026-08-30', '2026-08-30', '2026-08-31', 7)
  `;
  yield* sql`
    INSERT INTO orchestration_events (
      event_id, aggregate_kind, stream_id, stream_version, event_type, occurred_at,
      command_id, causation_event_id, correlation_id, actor_kind, payload_json, metadata_json
    )
    VALUES (
      'project-created', 'project', 'project-1', 0, 'project.created', '2026-08-30T00:00:00.000Z',
      'command-1', NULL, 'command-1', 'server',
      ${JSON.stringify({ projectId: "project-1", defaultModelSelection })}, '{}'
    )
  `;
});

const schemaOf = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql<{ readonly type: string; readonly name: string; readonly sql: string | null }>`
    SELECT type, name, sql FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%'
    ORDER BY type, name
  `;
});

const history = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly migration_id: number; readonly name: string }>`
    SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id
  `;
  return rows.map((row) => [row.migration_id, row.name] as const);
});

describe("private V2 migration layout upgrade", () => {
  it.effect("moves the private layout onto main's ids and matches a fresh schema", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* seedPrivateLayout;
      const imports = yield* sql`SELECT * FROM orchestration_v2_legacy_imports`;

      const executed = yield* runMigrations();
      assert.deepStrictEqual(executed.slice(0, 11), [
        [45, "ProjectionProjectsAutoPull"],
        [46, "RepairAutomaticSettlementTimestamps"],
        [47, "ProjectionProjectIcon"],
        [48, "ProjectionThreadBranchPullRequest"],
        [49, "ProjectionThreadsActiveOrderKey"],
        [50, "ProjectionThreadPullRequests"],
        [51, "ProjectionThreadMessageContext"],
        [52, "ProjectionThreadTitleState"],
        [53, "PullRequestFilesViewed"],
        [54, "ProjectionThreadsAutoSettleDisabledAt"],
        [55, "OrchestrationV2"],
      ]);
      assert.deepStrictEqual(executed.at(-1), migrationManifest.at(-1));
      assert.deepStrictEqual(yield* runMigrations(), []);
      assert.deepStrictEqual(yield* history, migrationManifest);
      assert.deepStrictEqual(yield* sql`SELECT * FROM orchestration_v2_legacy_imports`, imports);

      // 044 is recorded, not run, so carried-over default models survive.
      const [created] = yield* sql<{ readonly payload_json: string }>`
        SELECT payload_json FROM orchestration_events WHERE event_id = 'project-created'
      `;
      assert.deepStrictEqual(
        JSON.parse(created!.payload_json).defaultModelSelection,
        defaultModelSelection,
      );

      const upgraded = yield* schemaOf;
      const fresh = yield* runMigrations().pipe(
        Effect.andThen(schemaOf),
        Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" })),
      );
      assert.deepStrictEqual(upgraded, fresh);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("rolls back schema and history together on failure and can retry", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* seedPrivateLayout;
      const before = yield* history;
      yield* sql`
        CREATE TRIGGER fail_private_upgrade BEFORE INSERT ON effect_sql_migrations
        WHEN NEW.name = 'OrchestrationV2' AND NEW.migration_id = 55
        BEGIN SELECT RAISE(ABORT, 'injected failure'); END
      `;
      assert.ok(Exit.isFailure(yield* Effect.exit(runMigrations())));
      assert.deepStrictEqual(yield* history, before);
      assert.deepStrictEqual(
        yield* sql`SELECT name FROM sqlite_master WHERE name = 'pull_request_files_viewed'`,
        [],
      );
      yield* sql`DROP TRIGGER fail_private_upgrade`;
      yield* runMigrations();
      assert.deepStrictEqual(yield* history, migrationManifest);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect("refuses a private tail whose earlier slots came from different code", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* seedPrivateLayout;
      yield* sql`UPDATE effect_sql_migrations SET name = 'UnknownFork' WHERE migration_id = 42`;
      const before = yield* history;
      assert.ok(Exit.isFailure(yield* Effect.exit(runMigrations())));
      assert.deepStrictEqual(yield* history, before);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );
});
