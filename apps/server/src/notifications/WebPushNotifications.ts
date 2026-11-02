import {
  type AuthSessionId,
  type OrchestrationV2Run,
  type ThreadId,
  type WebPushStatus,
  type WebPushSubscribeInput,
  threadNotificationTag,
  WebPushError,
  WebPushPayload,
} from "@t3tools/contracts";
import { projectThreadAwarenessV2 } from "@t3tools/shared/agentAwareness";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import {
  backgroundWorkHoldsCompletion,
  turnItemUpdateCanEndBackgroundWork,
} from "@t3tools/shared/orchestrationV2PendingBackgroundWork";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FiberMap from "effect/FiberMap";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../project/ProjectService.ts";
import { forkParked } from "../serverActivation.ts";
import * as WebPushTransport from "./WebPushTransport.ts";

export class WebPushNotifications extends Context.Service<
  WebPushNotifications,
  {
    readonly status: (
      sessionId: AuthSessionId,
      endpoint: string | null,
    ) => Effect.Effect<WebPushStatus, WebPushError>;
    readonly subscribe: (
      sessionId: AuthSessionId,
      input: WebPushSubscribeInput,
    ) => Effect.Effect<void, WebPushError>;
    readonly unsubscribe: (
      sessionId: AuthSessionId,
      endpoint: string,
    ) => Effect.Effect<void, WebPushError>;
    /** Notifies subscribed browsers of runs that complete from now on; no replay. */
    readonly start: () => Effect.Effect<void, never, Scope.Scope>;
    readonly drain: Effect.Effect<void>;
  }
>()("t3/notifications/WebPushNotifications") {}

type CompletedRun = Pick<OrchestrationV2Run, "id" | "ordinal" | "completedAt">;

interface SubscriptionRow {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly origin: string;
}

const VAPID_KEYS_SECRET = "web-push-vapid.json";
// An orchestrator run can end moments before its continuation starts.
const COMPLETION_GRACE = "5 seconds";

const decodeKeys = Schema.decodeUnknownEffect(Schema.fromJsonString(WebPushTransport.VapidKeys));
const encodeKeys = Schema.encodeEffect(Schema.fromJsonString(WebPushTransport.VapidKeys));
const encodePayload = Schema.encodeSync(Schema.fromJsonString(WebPushPayload));

const storageError = (cause: unknown) => new WebPushError({ reason: "storage", cause });

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const secrets = yield* ServerSecretStore.ServerSecretStore;
  const transport = yield* WebPushTransport.WebPushTransport;
  const threads = yield* ThreadManagement.ThreadManagementService;
  const projects = yield* ProjectService.ProjectService;
  const serverEnvironment = yield* ServerEnvironment.ServerEnvironment;

  // Owned outside the shared migration ledger, where a fork's id would collide with upstream's.
  // Databases that ran the fork's 053_WebPushNotifications already hold these exact tables.
  yield* sql`
    CREATE TABLE IF NOT EXISTS web_push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES auth_sessions(session_id) ON DELETE CASCADE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      origin TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `.pipe(Effect.orDie);
  yield* sql`
    CREATE TABLE IF NOT EXISTS web_push_completions (
      thread_id TEXT PRIMARY KEY,
      run_ordinal INTEGER NOT NULL
    )
  `.pipe(Effect.orDie);

  const keyLock = yield* Semaphore.make(1);
  let cachedKeys: WebPushTransport.VapidKeys | undefined;
  const getKeys = keyLock
    .withPermits(1)(
      Effect.gen(function* () {
        if (cachedKeys) return cachedKeys;
        const stored = yield* secrets.get(VAPID_KEYS_SECRET);
        const keys = Option.isSome(stored)
          ? yield* decodeKeys(new TextDecoder().decode(stored.value))
          : yield* transport.generateKeys;
        if (Option.isNone(stored)) {
          yield* secrets.set(VAPID_KEYS_SECRET, new TextEncoder().encode(yield* encodeKeys(keys)));
        }
        cachedKeys = keys;
        return keys;
      }),
    )
    .pipe(Effect.mapError(storageError));

  const status = Effect.fn("WebPushNotifications.status")(function* (
    sessionId: AuthSessionId,
    endpoint: string | null,
  ) {
    const keys = yield* getKeys;
    const rows = yield* sql`
      SELECT endpoint FROM web_push_subscriptions
      WHERE session_id = ${sessionId} AND endpoint = ${endpoint}
    `.pipe(Effect.mapError(storageError));
    return { publicKey: keys.publicKey, enabled: rows.length > 0 };
  });

  const subscribe = Effect.fn("WebPushNotifications.subscribe")(function* (
    sessionId: AuthSessionId,
    input: WebPushSubscribeInput,
  ) {
    // Push services contact this origin as the VAPID subject, and only HTTPS pages can subscribe.
    const origin = URL.parse(input.origin);
    if (origin === null || origin.origin !== input.origin || origin.protocol !== "https:") {
      return yield* new WebPushError({ reason: "insecure_origin" });
    }
    const now = DateTime.formatIso(yield* DateTime.now);
    yield* getKeys;
    yield* sql`
      INSERT INTO web_push_subscriptions (endpoint, session_id, p256dh, auth, origin, created_at)
      VALUES (${input.subscription.endpoint}, ${sessionId}, ${input.subscription.keys.p256dh},
        ${input.subscription.keys.auth}, ${origin.origin}, ${now})
      ON CONFLICT(endpoint) DO UPDATE SET session_id = excluded.session_id,
        p256dh = excluded.p256dh, auth = excluded.auth, origin = excluded.origin
    `.pipe(Effect.mapError(storageError));
  });

  const unsubscribe = Effect.fn("WebPushNotifications.unsubscribe")(function* (
    sessionId: AuthSessionId,
    endpoint: string,
  ) {
    yield* sql`
      DELETE FROM web_push_subscriptions WHERE session_id = ${sessionId} AND endpoint = ${endpoint}
    `.pipe(Effect.mapError(storageError));
  });

  /** Claims the run so it notifies once across restarts, then returns live sessions' subscriptions. */
  const claimRecipients = Effect.fn("WebPushNotifications.claimRecipients")(
    function* (threadId: ThreadId, runOrdinal: number, completedAt: string) {
      const now = DateTime.formatIso(yield* DateTime.now);
      const claimed = yield* sql`
        INSERT INTO web_push_completions (thread_id, run_ordinal)
        VALUES (${threadId}, ${runOrdinal})
        ON CONFLICT(thread_id) DO UPDATE SET run_ordinal = excluded.run_ordinal
        WHERE web_push_completions.run_ordinal < excluded.run_ordinal
        RETURNING thread_id
      `;
      if (claimed.length === 0) return [];
      yield* sql`
        DELETE FROM web_push_subscriptions WHERE session_id NOT IN (
          SELECT session_id FROM auth_sessions WHERE revoked_at IS NULL AND expires_at > ${now}
        )
      `;
      return yield* sql<SubscriptionRow>`
        SELECT endpoint, p256dh, auth, origin FROM web_push_subscriptions
        WHERE created_at <= ${completedAt}
      `;
    },
    (effect) => sql.withTransaction(effect),
  );

  // Completed runs whose thread still awaits background work; that work ending re-checks them.
  const heldByBackgroundWork = new Map<ThreadId, CompletedRun>();
  /** Skips continued, stopped, settled, and side threads, using the same rules as T3 Connect alerts. */
  const notifyIfCompleted = Effect.fn("WebPushNotifications.notifyIfCompleted")(
    function* (threadId: ThreadId, run: CompletedRun) {
      const anySubscription = yield* sql`SELECT 1 FROM web_push_subscriptions LIMIT 1`;
      if (anySubscription.length === 0 || run.completedAt === null) return;
      const thread = yield* threads.getThreadShell(threadId);
      heldByBackgroundWork.delete(threadId);
      if (thread === null || thread.archivedAt !== null || thread.latestRunId !== run.id) return;
      if (
        thread.status === "completed" &&
        backgroundWorkHoldsCompletion(thread.pendingBackgroundTasks ?? [])
      ) {
        heldByBackgroundWork.set(threadId, run);
        return;
      }
      const project = yield* projects.getById(thread.projectId);
      if (Option.isNone(project)) return;
      const environmentId = yield* serverEnvironment.getEnvironmentId;
      const state = projectThreadAwarenessV2({ environmentId, project: project.value, thread });
      if (state?.phase !== "completed") return;
      const recipients = yield* claimRecipients(
        threadId,
        run.ordinal,
        DateTime.formatIso(run.completedAt),
      );
      if (recipients.length === 0) return;
      const keys = yield* getKeys;
      const title = thread.title.slice(0, 180);
      const body = ["Agent turn completed.", project.value.title, thread.branch]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 300);
      yield* Effect.forEach(
        recipients,
        (row) =>
          transport
            .send({
              subscription: {
                endpoint: row.endpoint,
                keys: { p256dh: row.p256dh, auth: row.auth },
              },
              keys,
              origin: row.origin,
              payload: encodePayload({
                title,
                body,
                tag: threadNotificationTag(environmentId, threadId),
                url: `${row.origin}/${encodeURIComponent(environmentId)}/${encodeURIComponent(threadId)}`,
              }),
            })
            .pipe(
              Effect.catchTags({
                PushDeliveryError: (error) =>
                  error.statusCode === 404 || error.statusCode === 410
                    ? sql`DELETE FROM web_push_subscriptions WHERE endpoint = ${row.endpoint}`.pipe(
                        Effect.asVoid,
                      )
                    : // Never log endpoints or encryption keys.
                      Effect.logWarning("Web Push delivery failed", {
                        statusCode: error.statusCode,
                      }),
              }),
            ),
        { concurrency: 4, discard: true },
      );
    },
    (effect, threadId) =>
      effect.pipe(
        Effect.catch((cause) =>
          Effect.logWarning("Unable to deliver completion notifications", { threadId, cause }),
        ),
      ),
  );

  const worker = yield* makeDrainableWorker(
    (item: { readonly threadId: ThreadId; readonly run: CompletedRun }) =>
      notifyIfCompleted(item.threadId, item.run),
  );

  const start = Effect.fn("WebPushNotifications.start")(function* () {
    // Keyed by thread: a newer event restarts the grace period.
    const timers = yield* FiberMap.make<ThreadId>();
    const schedule = (threadId: ThreadId, run: CompletedRun) =>
      FiberMap.run(
        timers,
        threadId,
        Effect.sleep(COMPLETION_GRACE).pipe(Effect.andThen(worker.enqueue({ threadId, run }))),
      ).pipe(Effect.asVoid);
    yield* forkParked(
      Stream.runForEach(threads.streamDomainEvents, (event) => {
        if (event.type === "run.updated" && event.payload.status === "completed") {
          return schedule(event.threadId, event.payload);
        }
        const held = heldByBackgroundWork.get(event.threadId);
        return held !== undefined &&
          event.type === "turn-item.updated" &&
          turnItemUpdateCanEndBackgroundWork(event.payload)
          ? schedule(event.threadId, held)
          : Effect.void;
      }),
    );
  });

  return WebPushNotifications.of({ status, subscribe, unsubscribe, start, drain: worker.drain });
});

export const layer = Layer.effect(WebPushNotifications, make);
