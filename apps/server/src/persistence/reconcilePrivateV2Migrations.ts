import * as Effect from "effect/Effect";
import * as Migrator from "effect/sql/Migrator";
import * as SqlClient from "effect/sql/SqlClient";

import ProjectionProjectsAutoPull from "./Migrations/045_ProjectionProjectsAutoPull.ts";
import RepairAutomaticSettlementTimestamps from "./Migrations/046_RepairAutomaticSettlementTimestamps.ts";
import ProjectionProjectIcon from "./Migrations/047_ProjectionProjectIcon.ts";
import ProjectionThreadBranchPullRequest from "./Migrations/048_ProjectionThreadBranchPullRequest.ts";
import ProjectionThreadsActiveOrderKey from "./Migrations/049_ProjectionThreadsActiveOrderKey.ts";
import ProjectionThreadPullRequests from "./Migrations/050_ProjectionThreadPullRequests.ts";
import ProjectionThreadMessageContext from "./Migrations/051_ProjectionThreadMessageContext.ts";
import ProjectionThreadTitleState from "./Migrations/052_ProjectionThreadTitleState.ts";
import PullRequestFilesViewed from "./Migrations/053_PullRequestFilesViewed.ts";
import ProjectionThreadsAutoSettleDisabledAt from "./Migrations/054_ProjectionThreadsAutoSettleDisabledAt.ts";
import ApplicationEventSequenceIndexes from "./Migrations/OrchestrationV2/ApplicationEventSequenceIndexes.ts";
import OrchestrationV2RecoveryIndexes from "./Migrations/OrchestrationV2/RecoveryIndexes.ts";
import OrchestrationV2ShellIndexes from "./Migrations/OrchestrationV2/ShellIndexes.ts";

/**
 * A private integration build ran the V2 schema as nine split migrations in slots 44-52,
 * before main released other migrations there and consolidated V2 into slot 55.
 */
export const PRIVATE_V2_MIGRATION_SLOTS = [
  [44, "OrchestrationV2"],
  [45, "OrchestrationV2Subagents"],
  [46, "OrchestrationV2Foundation"],
  [47, "OrchestrationV2ProviderSessionBindings"],
  [48, "OrchestrationV2ThreadLaunchWorkflows"],
  [49, "ApplicationEventSource"],
  [50, "OrchestrationV2EffectCancellation"],
  [51, "ScheduledTasks"],
  [52, "LegacyV1ImportState"],
] as const;

const RELEASED_SLOTS = [
  [44, "ClearAutomaticProjectModelDefaults", undefined],
  [45, "ProjectionProjectsAutoPull", ProjectionProjectsAutoPull],
  [46, "RepairAutomaticSettlementTimestamps", RepairAutomaticSettlementTimestamps],
  [47, "ProjectionProjectIcon", ProjectionProjectIcon],
  [48, "ProjectionThreadBranchPullRequest", ProjectionThreadBranchPullRequest],
  [49, "ProjectionThreadsActiveOrderKey", ProjectionThreadsActiveOrderKey],
  [50, "ProjectionThreadPullRequests", ProjectionThreadPullRequests],
  [51, "ProjectionThreadMessageContext", ProjectionThreadMessageContext],
  [52, "ProjectionThreadTitleState", ProjectionThreadTitleState],
  [53, "PullRequestFilesViewed", PullRequestFilesViewed],
  [54, "ProjectionThreadsAutoSettleDisabledAt", ProjectionThreadsAutoSettleDisabledAt],
] as const;

/**
 * Moves the private layout onto main's ids without replaying V2, keeping its events and imports.
 * The V2 tables already match main's 055 apart from three index groups, which run here.
 * 044 is recorded but not run: it would clear default models the V2 re-baseline carried over.
 */
export const reconcilePrivateV2Migrations = Effect.fn("reconcilePrivateV2Migrations")(function* (
  releasedManifest: ReadonlyArray<readonly [number, string]>,
) {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const tables = yield* sql`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'effect_sql_migrations'
      `;
      if (tables.length === 0) return [];
      const history = yield* sql<{ readonly migration_id: number; readonly name: string }>`
        SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id
      `;
      const tail = history.filter((row) => row.migration_id >= 44);
      const isPrivateLayout =
        tail.length === PRIVATE_V2_MIGRATION_SLOTS.length &&
        PRIVATE_V2_MIGRATION_SLOTS.every(
          ([id, name], index) => tail[index]?.migration_id === id && tail[index]?.name === name,
        );
      if (!isPrivateLayout) return [];

      const releasedNames = new Map(releasedManifest);
      const mismatched = history.filter(
        (row) => row.migration_id < 44 && releasedNames.get(row.migration_id) !== row.name,
      );
      if (mismatched.length > 0) {
        return yield* new Migrator.MigrationError({
          kind: "BadState",
          message: `Cannot upgrade the private V2 migration layout: slots ${mismatched
            .map((row) => `${row.migration_id}:${row.name}`)
            .join(", ")} differ from this build.`,
        });
      }

      const executed: Array<readonly [number, string]> = [];
      for (const [id, name, migration] of RELEASED_SLOTS) {
        if (migration === undefined) continue;
        yield* migration;
        executed.push([id, name]);
      }
      yield* ApplicationEventSequenceIndexes;
      yield* OrchestrationV2RecoveryIndexes;
      yield* OrchestrationV2ShellIndexes;
      executed.push([55, "OrchestrationV2"]);
      // Left behind by a private token-usage migration that never shipped.
      yield* sql`DROP TABLE IF EXISTS orchestration_v2_projection_thread_token_usage`;

      yield* sql`DELETE FROM effect_sql_migrations WHERE migration_id BETWEEN 44 AND 52`;
      for (const [id, name] of [...RELEASED_SLOTS, [55, "OrchestrationV2"] as const]) {
        yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES (${id}, ${name})`;
      }
      return executed;
    }),
  );
});
