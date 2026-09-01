/**
 * MigrationsLive - Migration runner with inline loader
 *
 * Uses Migrator.make with fromRecord to define migrations inline.
 * All migrations are statically imported - no dynamic file system loading.
 *
 * Migrations run automatically when the MigrationLayer is provided,
 * ensuring the database schema is always up-to-date before the application starts.
 */

import * as Migrator from "effect/unstable/sql/Migrator";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

// Import all migrations statically
import Migration0001 from "./Migrations/001_OrchestrationEvents.ts";
import Migration0002 from "./Migrations/002_OrchestrationCommandReceipts.ts";
import Migration0003 from "./Migrations/003_CheckpointDiffBlobs.ts";
import Migration0004 from "./Migrations/004_ProviderSessionRuntime.ts";
import Migration0005 from "./Migrations/005_Projections.ts";
import Migration0006 from "./Migrations/006_ProjectionThreadSessionRuntimeModeColumns.ts";
import Migration0007 from "./Migrations/007_ProjectionThreadMessageAttachments.ts";
import Migration0008 from "./Migrations/008_ProjectionThreadActivitySequence.ts";
import Migration0009 from "./Migrations/009_ProviderSessionRuntimeMode.ts";
import Migration0010 from "./Migrations/010_ProjectionThreadsRuntimeMode.ts";
import Migration0011 from "./Migrations/011_OrchestrationThreadCreatedRuntimeMode.ts";
import Migration0012 from "./Migrations/012_ProjectionThreadsInteractionMode.ts";
import Migration0013 from "./Migrations/013_ProjectionThreadProposedPlans.ts";
import Migration0014 from "./Migrations/014_ProjectionThreadProposedPlanImplementation.ts";
import Migration0015 from "./Migrations/015_ProjectionTurnsSourceProposedPlan.ts";
import Migration0016 from "./Migrations/016_CanonicalizeModelSelections.ts";
import Migration0017 from "./Migrations/017_ProjectionThreadsArchivedAt.ts";
import Migration0018 from "./Migrations/018_ProjectionThreadsArchivedAtIndex.ts";
import Migration0019 from "./Migrations/019_ProjectionSnapshotLookupIndexes.ts";
import Migration0020 from "./Migrations/020_AuthAccessManagement.ts";
import Migration0021 from "./Migrations/021_AuthSessionClientMetadata.ts";
import Migration0022 from "./Migrations/022_AuthSessionLastConnectedAt.ts";
import Migration0023 from "./Migrations/023_ProjectionThreadShellSummary.ts";
import Migration0024 from "./Migrations/024_BackfillProjectionThreadShellSummary.ts";
import Migration0025 from "./Migrations/025_CleanupInvalidProjectionPendingApprovals.ts";
import Migration0026 from "./Migrations/026_CanonicalizeModelSelectionOptions.ts";
import Migration0027 from "./Migrations/027_ProviderSessionRuntimeInstanceId.ts";
import Migration0028 from "./Migrations/028_ProjectionThreadSessionInstanceId.ts";
import Migration0029 from "./Migrations/029_ProjectionThreadDetailOrderingIndexes.ts";
import Migration0030 from "./Migrations/030_ProjectionThreadShellArchiveIndexes.ts";
import Migration0031 from "./Migrations/031_AuthAuthorizationScopes.ts";
import Migration0032 from "./Migrations/032_AuthPairingProofKeyThumbprint.ts";
import Migration0033 from "./Migrations/033_ProjectionThreadsSettled.ts";
import Migration0034 from "./Migrations/034_ProjectionThreadsSnoozed.ts";
import Migration0035 from "./Migrations/035_ProjectionThreadTitleRegeneration.ts";
import Migration0036 from "./Migrations/036_ProjectionThreadsPinned.ts";
import Migration0037 from "./Migrations/037_ProjectionTurnsKeysetIndex.ts";
import Migration0038 from "./Migrations/038_ProjectionThreadsPinOrderKey.ts";
import Migration0039 from "./Migrations/039_ProjectionProjectsDefaultThreadEnvMode.ts";
import Migration0040 from "./Migrations/040_ProjectionProjectFaviconPath.ts";
import Migration0041 from "./Migrations/041_AuthSessionClientConnection.ts";
import Migration0042 from "./Migrations/042_ProjectionThreadLinkedPullRequest.ts";
import Migration0043 from "./Migrations/043_ProjectionThreadsUnsettledAt.ts";
import Migration0044 from "./Migrations/044_OrchestrationV2.ts";
import Migration0045 from "./Migrations/045_OrchestrationV2Subagents.ts";
import Migration0046 from "./Migrations/046_OrchestrationV2Foundation.ts";
import Migration0047 from "./Migrations/047_OrchestrationV2ProviderSessionBindings.ts";
import Migration0048 from "./Migrations/048_OrchestrationV2ThreadLaunchWorkflows.ts";
import Migration0049 from "./Migrations/049_ApplicationEventSource.ts";
import Migration0050 from "./Migrations/050_OrchestrationV2EffectCancellation.ts";
import Migration0051 from "./Migrations/051_ScheduledTasks.ts";
import Migration0052 from "./Migrations/052_LegacyV1ImportState.ts";

/**
 * Migration loader with all migrations defined inline.
 *
 * Key format: "{id}_{name}" where:
 * - id: numeric migration ID (determines execution order)
 * - name: descriptive name for the migration
 *
 * Uses Migrator.fromRecord which parses the key format and
 * returns migrations sorted by ID.
 */
export const migrationEntries = [
  [1, "OrchestrationEvents", Migration0001],
  [2, "OrchestrationCommandReceipts", Migration0002],
  [3, "CheckpointDiffBlobs", Migration0003],
  [4, "ProviderSessionRuntime", Migration0004],
  [5, "Projections", Migration0005],
  [6, "ProjectionThreadSessionRuntimeModeColumns", Migration0006],
  [7, "ProjectionThreadMessageAttachments", Migration0007],
  [8, "ProjectionThreadActivitySequence", Migration0008],
  [9, "ProviderSessionRuntimeMode", Migration0009],
  [10, "ProjectionThreadsRuntimeMode", Migration0010],
  [11, "OrchestrationThreadCreatedRuntimeMode", Migration0011],
  [12, "ProjectionThreadsInteractionMode", Migration0012],
  [13, "ProjectionThreadProposedPlans", Migration0013],
  [14, "ProjectionThreadProposedPlanImplementation", Migration0014],
  [15, "ProjectionTurnsSourceProposedPlan", Migration0015],
  [16, "CanonicalizeModelSelections", Migration0016],
  [17, "ProjectionThreadsArchivedAt", Migration0017],
  [18, "ProjectionThreadsArchivedAtIndex", Migration0018],
  [19, "ProjectionSnapshotLookupIndexes", Migration0019],
  [20, "AuthAccessManagement", Migration0020],
  [21, "AuthSessionClientMetadata", Migration0021],
  [22, "AuthSessionLastConnectedAt", Migration0022],
  [23, "ProjectionThreadShellSummary", Migration0023],
  [24, "BackfillProjectionThreadShellSummary", Migration0024],
  [25, "CleanupInvalidProjectionPendingApprovals", Migration0025],
  [26, "CanonicalizeModelSelectionOptions", Migration0026],
  [27, "ProviderSessionRuntimeInstanceId", Migration0027],
  [28, "ProjectionThreadSessionInstanceId", Migration0028],
  [29, "ProjectionThreadDetailOrderingIndexes", Migration0029],
  [30, "ProjectionThreadShellArchiveIndexes", Migration0030],
  [31, "AuthAuthorizationScopes", Migration0031],
  [32, "AuthPairingProofKeyThumbprint", Migration0032],
  [33, "ProjectionThreadsSettled", Migration0033],
  [34, "ProjectionThreadsSnoozed", Migration0034],
  [35, "ProjectionThreadTitleRegeneration", Migration0035],
  [36, "ProjectionThreadsPinned", Migration0036],
  [37, "ProjectionTurnsKeysetIndex", Migration0037],
  [38, "ProjectionThreadsPinOrderKey", Migration0038],
  [39, "ProjectionProjectsDefaultThreadEnvMode", Migration0039],
  [40, "ProjectionProjectFaviconPath", Migration0040],
  [41, "AuthSessionClientConnection", Migration0041],
  [42, "ProjectionThreadLinkedPullRequest", Migration0042],
  [43, "ProjectionThreadsUnsettledAt", Migration0043],
  [44, "OrchestrationV2", Migration0044],
  [45, "OrchestrationV2Subagents", Migration0045],
  [46, "OrchestrationV2Foundation", Migration0046],
  [47, "OrchestrationV2ProviderSessionBindings", Migration0047],
  [48, "OrchestrationV2ThreadLaunchWorkflows", Migration0048],
  [49, "ApplicationEventSource", Migration0049],
  [50, "OrchestrationV2EffectCancellation", Migration0050],
  [51, "ScheduledTasks", Migration0051],
  [52, "LegacyV1ImportState", Migration0052],
] as const;

export const migrationManifest = migrationEntries.map(([id, name]) => [id, name] as const);

interface AppliedMigration {
  readonly migration_id: number;
  readonly name: string;
}

const legacyPrivateMigrationManifest = [
  [41, "OrchestrationV2"],
  [42, "OrchestrationV2Subagents"],
  [43, "OrchestrationV2Foundation"],
  [44, "OrchestrationV2ProviderSessionBindings"],
  [45, "OrchestrationV2ThreadLaunchWorkflows"],
  [46, "ApplicationEventSource"],
  [47, "OrchestrationV2EffectCancellation"],
  [48, "ScheduledTasks"],
  [49, "LegacyV1ImportState"],
  [50, "OrchestrationV2ThreadTokenUsage"],
] as const;

export class MigrationSlotCollisionError extends Schema.TaggedErrorClass<MigrationSlotCollisionError>()(
  "MigrationSlotCollisionError",
  {
    slot: Schema.Int,
    codeName: Schema.String,
    appliedName: Schema.String,
  },
) {
  override get message(): string {
    return `Migration slot collision at ${this.slot}: this checkout registers '${this.codeName}' but the database already applied '${this.appliedName}' in that slot.`;
  }
}

const loadAppliedMigrations = Effect.fn("loadAppliedMigrations")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const tables = yield* sql<{ readonly name: string }>`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'effect_sql_migrations'
  `;
  if (tables.length === 0) {
    return [];
  }
  return yield* sql<AppliedMigration>`
    SELECT migration_id, name
    FROM effect_sql_migrations
    ORDER BY migration_id
  `;
});

const verifyAppliedMigrationSlots = Effect.fn("verifyAppliedMigrationSlots")(function* (
  applied: ReadonlyArray<AppliedMigration>,
  expected: ReadonlyArray<readonly [number, string]> = migrationManifest,
) {
  const appliedById = new Map(applied.map((row) => [Number(row.migration_id), row.name] as const));
  for (const [slot, codeName] of expected) {
    const appliedName = appliedById.get(slot);
    if (appliedName !== undefined && appliedName !== codeName) {
      return yield* new MigrationSlotCollisionError({ slot, codeName, appliedName });
    }
  }
});

/** Fail before migrations can silently skip a differently named occupied slot. */
export const verifyMigrationSlots = Effect.fn("verifyMigrationSlots")(function* () {
  yield* verifyAppliedMigrationSlots(yield* loadAppliedMigrations());
});

/**
 * One private build used slots 41-50 before released migrations claimed 41-43.
 * Recognize only that exact journal tail, move its surviving entries to 44-52,
 * and apply the released migrations that belong in the vacated slots.
 */
const repairLegacyPrivateMigrationSlots = Effect.fn("repairLegacyPrivateMigrationSlots")(
  function* () {
    const applied = yield* loadAppliedMigrations();

    // Even an otherwise matching private tail is unsafe to repair if an older
    // released slot was also claimed by different code.
    yield* verifyAppliedMigrationSlots(applied, migrationManifest.slice(0, 40));

    const privateTail = applied.filter((row) => Number(row.migration_id) > 40);
    const isLegacyPrivateLayout =
      privateTail.length === legacyPrivateMigrationManifest.length &&
      legacyPrivateMigrationManifest.every(
        ([migrationId, name], index) =>
          Number(privateTail[index]?.migration_id) === migrationId &&
          privateTail[index]?.name === name,
      );
    if (!isLegacyPrivateLayout) {
      return false;
    }

    const sql = yield* SqlClient.SqlClient;
    yield* sql.withTransaction(
      Effect.gen(function* () {
        // Migration 50 was removed, but its table and data remain useful to the
        // old build and harmless to current code. Remove only its journal row.
        yield* sql`DELETE FROM effect_sql_migrations WHERE migration_id = 50`;

        // Move 41-49 aside first to avoid primary-key collisions, then place
        // them at their current slots 44-52 without changing their timestamps.
        yield* sql`
        UPDATE effect_sql_migrations
        SET migration_id = migration_id + 1000
        WHERE migration_id BETWEEN 41 AND 49
      `;
        yield* sql`
        UPDATE effect_sql_migrations
        SET migration_id = migration_id - 997
        WHERE migration_id BETWEEN 1041 AND 1049
      `;

        yield* Migration0041;
        yield* Migration0042;
        yield* Migration0043;
        yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES
          (41, 'AuthSessionClientConnection'),
          (42, 'ProjectionThreadLinkedPullRequest'),
          (43, 'ProjectionThreadsUnsettledAt')
      `;

        yield* verifyMigrationSlots();
      }),
    );
    yield* Effect.log("Repaired legacy private migration slots");
    return true;
  },
);

export const makeMigrationLoader = (throughId?: number) =>
  Migrator.fromRecord(
    Object.fromEntries(
      migrationEntries
        .filter(([id]) => throughId === undefined || id <= throughId)
        .map(([id, name, migration]) => [`${id}_${name}`, migration]),
    ),
  );

/**
 * Migrator run function - no schema dumping needed
 * Uses the base Migrator.make without platform dependencies
 */
const run = Migrator.make({});

export interface RunMigrationsOptions {
  readonly toMigrationInclusive?: number | undefined;
}

/**
 * Run all pending migrations.
 *
 * Creates the migrations tracking table (effect_sql_migrations) if it doesn't exist,
 * then runs any migrations with ID greater than the latest recorded migration.
 *
 * Returns array of [id, name] tuples for migrations that were run.
 *
 * @returns Effect containing array of executed migrations
 */
const runMigrationsInternal = Effect.fn("runMigrationsInternal")(function* ({
  toMigrationInclusive,
}: RunMigrationsOptions = {}) {
  const repairedLegacySlots = yield* repairLegacyPrivateMigrationSlots();
  if (!repairedLegacySlots) {
    yield* verifyMigrationSlots();
  }
  const executedMigrations = yield* run({ loader: makeMigrationLoader(toMigrationInclusive) });
  yield* verifyMigrationSlots();
  const migrations = executedMigrations.map(([id, name]) => `${id}_${name}`);
  yield* migrations.length === 0
    ? Effect.logDebug("Database schema is current")
    : Effect.log("Migrations ran successfully").pipe(Effect.annotateLogs({ migrations }));
  return executedMigrations;
});

export const runMigrations = Effect.fn("runMigrations")(function* (
  options: RunMigrationsOptions = {},
) {
  return yield* runMigrationsInternal(options).pipe(
    Effect.catchTag(
      "MigrationSlotCollisionError",
      (cause) =>
        new Migrator.MigrationError({
          kind: "BadState",
          message: cause.message,
          cause,
        }),
    ),
  );
});

/**
 * Layer that runs migrations when the layer is built.
 *
 * Use this to ensure migrations run before your application starts.
 * Migrations are run automatically - no separate script is needed.
 *
 * @example
 * ```typescript
 * import { MigrationsLive } from "@acme/db/Migrations"
 * import * as SqliteClient from "@acme/db/SqliteClient"
 *
 * // Migrations run automatically when SqliteClient is provided
 * const AppLayer = MigrationsLive.pipe(
 *   Layer.provideMerge(SqliteClient.layer({ filename: "database.sqlite" }))
 * )
 * ```
 */
export const MigrationsLive = Layer.effectDiscard(runMigrations());
