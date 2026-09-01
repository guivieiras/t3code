import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { migrationEntries, MigrationSlotCollisionError, runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";
import Migration0044 from "./044_OrchestrationV2.ts";
import Migration0045 from "./045_OrchestrationV2Subagents.ts";
import Migration0046 from "./046_OrchestrationV2Foundation.ts";
import Migration0047 from "./047_OrchestrationV2ProviderSessionBindings.ts";
import Migration0048 from "./048_OrchestrationV2ThreadLaunchWorkflows.ts";
import Migration0049 from "./049_ApplicationEventSource.ts";
import Migration0050 from "./050_OrchestrationV2EffectCancellation.ts";
import Migration0051 from "./051_ScheduledTasks.ts";
import Migration0052 from "./052_LegacyV1ImportState.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));
const isMigrationSlotCollisionError = Schema.is(MigrationSlotCollisionError);

layer("038_039_OrchestrationV2", (it) => {
  it.effect("keeps released and private migration ids contiguous", () =>
    Effect.sync(() => {
      assert.deepStrictEqual(
        migrationEntries.map(([id]) => id),
        Array.from({ length: 52 }, (_, index) => index + 1),
      );
    }),
  );

  it.effect("installs the orchestration v2 and subagent schemas", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 45 });

      const migrations = yield* sql<{
        readonly migration_id: number;
        readonly name: string;
      }>`
        SELECT migration_id, name
        FROM effect_sql_migrations
        WHERE migration_id IN (42, 43, 44, 45)
        ORDER BY migration_id
      `;
      assert.deepStrictEqual(migrations, [
        {
          migration_id: 42,
          name: "ProjectionThreadLinkedPullRequest",
        },
        {
          migration_id: 43,
          name: "ProjectionThreadsUnsettledAt",
        },
        {
          migration_id: 44,
          name: "OrchestrationV2",
        },
        {
          migration_id: 45,
          name: "OrchestrationV2Subagents",
        },
      ]);

      const eventColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(orchestration_v2_events)
      `;
      const subagentColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(orchestration_v2_projection_subagents)
      `;

      assert.ok(eventColumns.some((column) => column.name === "event_id"));
      assert.ok(subagentColumns.some((column) => column.name === "child_thread_id"));
    }),
  );

  it.effect("backfills provider-session thread bindings in migration 047", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 46 });
      yield* sql`
        INSERT INTO orchestration_v2_projection_provider_sessions (
          provider_session_id,
          thread_id,
          provider,
          driver,
          provider_instance_id,
          status,
          model,
          updated_at,
          payload_json
        ) VALUES (
          'provider-session:shared',
          'thread:existing',
          'codex',
          'codex',
          'codex',
          'ready',
          'gpt-5.4',
          '2026-01-01T00:00:00.000Z',
          '{}'
        )
      `;

      yield* runMigrations({ toMigrationInclusive: 47 });

      const bindings = yield* sql<{
        readonly provider_session_id: string;
        readonly thread_id: string;
      }>`
        SELECT provider_session_id, thread_id
        FROM orchestration_v2_projection_provider_session_bindings
      `;
      assert.deepStrictEqual(bindings, [
        {
          provider_session_id: "provider-session:shared",
          thread_id: "thread:existing",
        },
      ]);
    }),
  );

  it.effect("preserves turn items with colliding ordinals in migration 046", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 45 });
      yield* sql`
        INSERT INTO orchestration_v2_projection_runs (
          run_id,
          thread_id,
          ordinal,
          provider,
          status,
          requested_at,
          payload_json
        ) VALUES (
          'run:one',
          'thread:one',
          1,
          'codex',
          'completed',
          '2026-01-01T00:00:00.000Z',
          '{}'
        )
      `;
      yield* sql`
        INSERT INTO orchestration_v2_projection_turn_items (
          turn_item_id,
          thread_id,
          run_id,
          ordinal,
          type,
          status,
          updated_at,
          payload_json
        ) VALUES
          ('turn-item:b', 'thread:one', 'run:one', 7, 'assistant_message', 'completed', '2026-01-01T00:00:00.000Z', '{}'),
          ('turn-item:a', 'thread:one', 'run:one', 7, 'assistant_message', 'completed', '2026-01-01T00:00:00.000Z', '{}'),
          ('turn-item:c', 'thread:one', 'run:one', 9, 'assistant_message', 'completed', '2026-01-01T00:00:00.000Z', '{}'),
          ('turn-item:d', 'thread:two', NULL, 42, 'assistant_message', 'completed', '2026-01-01T00:00:00.000Z', '{}')
      `;

      yield* runMigrations({ toMigrationInclusive: 46 });

      const positions = yield* sql<{
        readonly thread_id: string;
        readonly turn_item_id: string;
        readonly ordinal: number;
      }>`
        SELECT thread_id, turn_item_id, ordinal
        FROM orchestration_v2_turn_item_positions
        ORDER BY thread_id, ordinal
      `;
      assert.deepStrictEqual(positions, [
        { thread_id: "thread:one", turn_item_id: "turn-item:a", ordinal: 1_000_001 },
        { thread_id: "thread:one", turn_item_id: "turn-item:b", ordinal: 1_000_002 },
        { thread_id: "thread:one", turn_item_id: "turn-item:c", ordinal: 1_000_003 },
        { thread_id: "thread:two", turn_item_id: "turn-item:d", ordinal: 1 },
      ]);
    }).pipe(Effect.provide(NodeSqliteClient.layerMemory())),
  );
});

it.effect("upgrades a database already at released main migration 043", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    yield* runMigrations({ toMigrationInclusive: 43 });
    const snoozeColumns = yield* sql<{ readonly name: string }>`
      PRAGMA table_info(projection_threads)
    `;
    assert.ok(snoozeColumns.some((column) => column.name === "snoozed_until"));
    assert.ok(snoozeColumns.some((column) => column.name === "snoozed_at"));

    yield* runMigrations({ toMigrationInclusive: 52 });

    const migrations = yield* sql<{
      readonly migration_id: number;
      readonly name: string;
    }>`
      SELECT migration_id, name
      FROM effect_sql_migrations
      WHERE migration_id BETWEEN 39 AND 52
      ORDER BY migration_id
    `;
    assert.deepStrictEqual(
      migrations.map(({ migration_id, name }) => [migration_id, name]),
      [
        [39, "ProjectionProjectsDefaultThreadEnvMode"],
        [40, "ProjectionProjectFaviconPath"],
        [41, "AuthSessionClientConnection"],
        [42, "ProjectionThreadLinkedPullRequest"],
        [43, "ProjectionThreadsUnsettledAt"],
        [44, "OrchestrationV2"],
        [45, "OrchestrationV2Subagents"],
        [46, "OrchestrationV2Foundation"],
        [47, "OrchestrationV2ProviderSessionBindings"],
        [48, "OrchestrationV2ThreadLaunchWorkflows"],
        [49, "ApplicationEventSource"],
        [50, "OrchestrationV2EffectCancellation"],
        [51, "ScheduledTasks"],
        [52, "LegacyV1ImportState"],
      ],
    );

    const v2Tables = yield* sql<{ readonly name: string }>`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'orchestration_v2_projection_threads'
    `;
    assert.strictEqual(v2Tables.length, 1);

    const legacyImportTables = yield* sql<{ readonly name: string }>`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'orchestration_v2_legacy_imports'
    `;
    assert.strictEqual(legacyImportTables.length, 1);
  }).pipe(Effect.provide(NodeSqliteClient.layerMemory())),
);

const legacyPrivateMigrations = [
  [41, "OrchestrationV2", Migration0044],
  [42, "OrchestrationV2Subagents", Migration0045],
  [43, "OrchestrationV2Foundation", Migration0046],
  [44, "OrchestrationV2ProviderSessionBindings", Migration0047],
  [45, "OrchestrationV2ThreadLaunchWorkflows", Migration0048],
  [46, "ApplicationEventSource", Migration0049],
  [47, "OrchestrationV2EffectCancellation", Migration0050],
  [48, "ScheduledTasks", Migration0051],
  [49, "LegacyV1ImportState", Migration0052],
] as const;

const installLegacyPrivateMigrationLayout = Effect.fn("installLegacyPrivateMigrationLayout")(
  function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 40 });
    for (const [migrationId, name, migration] of legacyPrivateMigrations) {
      yield* migration;
      yield* sql`
      INSERT INTO effect_sql_migrations (migration_id, name, created_at)
      VALUES (${migrationId}, ${name}, '2026-08-01 00:00:00')
    `;
    }
    yield* sql`
    CREATE TABLE orchestration_v2_projection_thread_token_usage (
      thread_id TEXT PRIMARY KEY,
      provider_thread_id TEXT NOT NULL,
      provider_turn_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    )
  `;
    yield* sql`
    INSERT INTO orchestration_v2_projection_thread_token_usage
      (thread_id, provider_thread_id, provider_turn_id, updated_at, payload_json)
    VALUES
      ('thread:legacy', 'provider-thread:legacy', 'provider-turn:legacy', '2026-08-01', '{}')
  `;
    yield* sql`
    INSERT INTO effect_sql_migrations (migration_id, name, created_at)
    VALUES (50, 'OrchestrationV2ThreadTokenUsage', '2026-08-01 00:00:00')
  `;
  },
);

it.effect("repairs the exact legacy private migration layout without losing data", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* installLegacyPrivateMigrationLayout();

    const executed = yield* runMigrations();
    assert.deepStrictEqual(executed, []);

    const migrations = yield* sql<{
      readonly migration_id: number;
      readonly name: string;
    }>`
      SELECT migration_id, name
      FROM effect_sql_migrations
      WHERE migration_id BETWEEN 41 AND 52
      ORDER BY migration_id
    `;
    assert.deepStrictEqual(
      migrations.map(({ migration_id, name }) => [migration_id, name]),
      migrationEntries.slice(40).map(([migrationId, name]) => [migrationId, name]),
    );

    const authColumns = yield* sql<{ readonly name: string }>`PRAGMA table_info(auth_sessions)`;
    const threadColumns = yield* sql<{
      readonly name: string;
    }>`PRAGMA table_info(projection_threads)`;
    assert.ok(authColumns.some((column) => column.name === "client_surface"));
    assert.ok(authColumns.some((column) => column.name === "client_app_version"));
    assert.ok(threadColumns.some((column) => column.name === "linked_pull_request_json"));
    assert.ok(threadColumns.some((column) => column.name === "unsettled_at"));

    const tokenUsage = yield* sql<{ readonly thread_id: string }>`
      SELECT thread_id FROM orchestration_v2_projection_thread_token_usage
    `;
    assert.deepStrictEqual(tokenUsage, [{ thread_id: "thread:legacy" }]);

    assert.deepStrictEqual(yield* runMigrations(), []);
  }).pipe(Effect.provide(NodeSqliteClient.layerMemory())),
);

it.effect("rejects an unknown private migration collision before changing schema", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 40 });
    yield* sql`
      INSERT INTO effect_sql_migrations (migration_id, name)
      VALUES (41, 'UnexpectedPrivateMigration')
    `;

    const error = yield* runMigrations().pipe(Effect.flip);
    assert.equal(error._tag, "MigrationError");
    if (error._tag === "MigrationError") {
      assert.equal(error.kind, "BadState");
      assert.ok(isMigrationSlotCollisionError(error.cause));
      if (isMigrationSlotCollisionError(error.cause)) {
        assert.equal(error.cause.slot, 41);
        assert.equal(error.cause.appliedName, "UnexpectedPrivateMigration");
      }
    }

    const migrations = yield* sql<{
      readonly migration_id: number;
      readonly name: string;
    }>`SELECT migration_id, name FROM effect_sql_migrations WHERE migration_id >= 41`;
    assert.deepStrictEqual(migrations, [{ migration_id: 41, name: "UnexpectedPrivateMigration" }]);
    const authColumns = yield* sql<{ readonly name: string }>`PRAGMA table_info(auth_sessions)`;
    assert.ok(!authColumns.some((column) => column.name === "client_surface"));
    assert.ok(!authColumns.some((column) => column.name === "client_app_version"));
  }).pipe(Effect.provide(NodeSqliteClient.layerMemory())),
);
