import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  AuthSessionId,
  EnvironmentId,
  EventId,
  MessageId,
  NodeId,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2Run,
  type OrchestrationV2ThreadShell,
  ProjectId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  threadNotificationTag,
  TurnItemId,
  type WebPushSubscribeInput,
  WebPushPayload,
} from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import authMigration from "../persistence/Migrations/031_AuthAuthorizationScopes.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as WebPushNotifications from "./WebPushNotifications.ts";
import * as WebPushTransport from "./WebPushTransport.ts";

const decodePayload = Schema.decodeUnknownEffect(Schema.fromJsonString(WebPushPayload));

const environmentId = EnvironmentId.make("environment-one");
const threadId = ThreadId.make("thread-one");
const projectId = ProjectId.make("project-one");
const sessionId = AuthSessionId.make("browser-one");
const otherSessionId = AuthSessionId.make("browser-two");
const subscription: WebPushSubscribeInput = {
  origin: "https://t3.example.com",
  subscription: {
    endpoint: "https://fcm.googleapis.com/push/one",
    keys: { p256dh: "a".repeat(87), auth: "b".repeat(22) },
  },
};
const secondSubscription: WebPushSubscribeInput = {
  ...subscription,
  subscription: { ...subscription.subscription, endpoint: "https://web.push.apple.com/second" },
};

const dependencies = Layer.mergeAll(
  NodeSqliteClient.layer({ filename: ":memory:" }),
  ServerSecretStore.layer.pipe(
    Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "t3-web-push-test-" })),
  ),
).pipe(Layer.provideMerge(NodeServices.layer));

function runId(ordinal: number) {
  return RunId.make(`run-${ordinal}`);
}

function shell(overrides: Partial<OrchestrationV2ThreadShell> = {}): OrchestrationV2ThreadShell {
  const epoch = DateTime.makeUnsafe(0);
  return {
    id: threadId,
    projectId,
    title: "Implement notifications",
    providerInstanceId: ProviderInstanceId.make("codex"),
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test-model" },
    runtimeMode: "full-access",
    interactionMode: "default",
    worktreePath: null,
    activeProviderThreadId: null,
    lineage: { rootThreadId: threadId, parentThreadId: null, relationshipToParent: null },
    forkedFrom: null,
    createdBy: "user",
    creationSource: "web",
    activeRunId: null,
    latestVisibleMessage: null,
    hasActionableProposedPlan: false,
    itemCount: 0,
    visibleItemCount: 0,
    deletedAt: null,
    branch: "feature/push",
    status: "completed",
    activityRunStatus: null,
    pendingRuntimeRequest: null,
    pendingBackgroundTasks: [],
    providerInstanceHistory: [],
    latestRunId: runId(1),
    latestUserMessageAt: null,
    createdAt: epoch,
    updatedAt: epoch,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    ...overrides,
  };
}

const fixture = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* authMigration;
  const now = DateTime.formatIso(yield* DateTime.now);
  for (const id of [sessionId, otherSessionId]) {
    yield* sql`
      INSERT INTO auth_sessions (session_id, subject, scopes, method, issued_at, expires_at)
      VALUES (${id}, 'test', '["orchestration:read"]', 'browser', ${now}, '9999-01-01T00:00:00.000Z')
    `;
  }
  const deliveries: Array<Parameters<WebPushTransport.WebPushTransport["Service"]["send"]>[0]> = [];
  let deliveryStatus = 201;
  let generatedKeys = 0;
  const transport = WebPushTransport.WebPushTransport.of({
    generateKeys: Effect.sync(() => {
      generatedKeys += 1;
      return { publicKey: "public-key", privateKey: "private-key" };
    }),
    send: (input) =>
      Effect.gen(function* () {
        deliveries.push(input);
        if (deliveryStatus !== 201) {
          return yield* new WebPushTransport.PushDeliveryError({ statusCode: deliveryStatus });
        }
      }),
  });
  const currentShell = yield* Ref.make<OrchestrationV2ThreadShell | null>(shell());

  /** A server process: its own service instance and live event stream. */
  const startServer = Effect.gen(function* () {
    const events = yield* Queue.unbounded<OrchestrationV2DomainEvent>();
    const pulls = yield* Queue.unbounded<void>();
    const notifications = yield* WebPushNotifications.make.pipe(
      Effect.provideService(WebPushTransport.WebPushTransport, transport),
      Effect.provide(
        Layer.mergeAll(
          Layer.mock(ThreadManagement.ThreadManagementService)({
            getThreadShell: () => Ref.get(currentShell),
            streamDomainEvents: Stream.fromEffectRepeat(
              Queue.offer(pulls, undefined).pipe(Effect.andThen(Queue.take(events))),
            ),
          }),
          Layer.mock(ProjectService.ProjectService)({
            getById: () =>
              Effect.succeedSome({
                id: projectId,
                title: "T3",
                workspaceRoot: "/workspace",
                defaultModelSelection: null,
                scripts: [],
                createdAt: "1970-01-01T00:00:00.000Z",
                updatedAt: "1970-01-01T00:00:00.000Z",
                deletedAt: null,
              }),
          }),
          Layer.mock(ServerEnvironment.ServerEnvironment)({
            getEnvironmentId: Effect.succeed(environmentId),
          }),
        ),
      ),
    );
    yield* notifications.start();
    yield* Queue.take(pulls);
    /** Delivers an event and waits until the listener has handled it. */
    const emit = (event: OrchestrationV2DomainEvent) =>
      Queue.offer(events, event).pipe(Effect.andThen(Queue.take(pulls)));
    /** Completes a run, then waits out the grace period and the delivery. */
    const complete = Effect.fn("test.complete")(function* (
      ordinal: number,
      completedAt?: DateTime.Utc,
    ) {
      const at = completedAt ?? (yield* DateTime.now);
      yield* emit(runCompleted(ordinal, at));
      yield* settle;
    });
    const settle = TestClock.adjust("5 seconds").pipe(Effect.andThen(notifications.drain));
    return { notifications, emit, complete, settle };
  });

  return {
    sql,
    currentShell,
    startServer,
    deliveries,
    setDeliveryStatus: (status: number) => {
      deliveryStatus = status;
    },
    generatedKeys: () => generatedKeys,
  };
});

function runCompleted(ordinal: number, completedAt: DateTime.Utc): OrchestrationV2DomainEvent {
  const run: OrchestrationV2Run = {
    id: runId(ordinal),
    threadId,
    ordinal,
    providerInstanceId: ProviderInstanceId.make("codex"),
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test-model" },
    providerThreadId: null,
    userMessageId: MessageId.make(`message-${ordinal}`),
    rootNodeId: null,
    activeAttemptId: null,
    status: "completed",
    requestedAt: completedAt,
    startedAt: completedAt,
    completedAt,
    checkpointId: null,
    contextHandoffId: null,
  };
  return {
    id: EventId.make(`event:run-${ordinal}:completed`),
    type: "run.updated",
    threadId,
    runId: run.id,
    occurredAt: completedAt,
    payload: run,
  };
}

it.effect(
  "persists subscriptions and keys across restarts and notifies once per completed run",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const first = yield* f.startServer;
      yield* first.notifications.subscribe(sessionId, subscription);
      const restarted = yield* f.startServer;
      expect(
        yield* restarted.notifications.status(sessionId, subscription.subscription.endpoint),
      ).toEqual({ publicKey: "public-key", enabled: true });
      expect(f.generatedKeys()).toBe(1);
      yield* restarted.complete(1);
      yield* restarted.complete(1);
      const restartedAgain = yield* f.startServer;
      yield* restartedAgain.complete(1);
      expect(f.deliveries).toHaveLength(1);
      const payload = yield* decodePayload(f.deliveries[0]!.payload);
      expect(payload).toEqual({
        title: "Implement notifications",
        body: "Agent turn completed. · T3 · feature/push",
        tag: threadNotificationTag(environmentId, threadId),
        url: "https://t3.example.com/environment-one/thread-one",
      });
      expect(f.deliveries[0]!.origin).toBe("https://t3.example.com");
      yield* Ref.set(f.currentShell, shell({ latestRunId: runId(2) }));
      yield* restartedAgain.complete(2);
      expect(f.deliveries).toHaveLength(2);
    }).pipe(Effect.scoped, Effect.provide(dependencies)),
);

it.effect("keeps subscriptions stored before the tables moved out of the migration ledger", () =>
  Effect.gen(function* () {
    const f = yield* fixture;
    // The fork's 053_WebPushNotifications migration created these exact tables.
    yield* f.sql`
      CREATE TABLE web_push_subscriptions (
        endpoint TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES auth_sessions(session_id) ON DELETE CASCADE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        origin TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `;
    yield* f.sql`CREATE TABLE web_push_completions (thread_id TEXT PRIMARY KEY, run_ordinal INTEGER NOT NULL)`;
    yield* f.sql`
      INSERT INTO web_push_subscriptions (endpoint, session_id, p256dh, auth, origin, created_at)
      VALUES (${subscription.subscription.endpoint}, ${sessionId}, ${"a".repeat(87)},
        ${"b".repeat(22)}, ${subscription.origin}, '1970-01-01T00:00:00.000Z')
    `;
    yield* f.sql`INSERT INTO web_push_completions (thread_id, run_ordinal) VALUES (${threadId}, 1)`;
    const server = yield* f.startServer;
    expect(
      (yield* server.notifications.status(sessionId, subscription.subscription.endpoint)).enabled,
    ).toBe(true);
    yield* server.complete(1);
    expect(f.deliveries).toHaveLength(0);
    yield* Ref.set(f.currentShell, shell({ latestRunId: runId(2) }));
    yield* server.complete(2);
    expect(f.deliveries.map((d) => d.subscription.endpoint)).toEqual([
      subscription.subscription.endpoint,
    ]);
  }).pipe(Effect.scoped, Effect.provide(dependencies)),
);

it.effect("keeps device subscriptions separate and only lets their session disable them", () =>
  Effect.gen(function* () {
    const f = yield* fixture;
    const server = yield* f.startServer;
    yield* server.notifications.subscribe(sessionId, subscription);
    yield* server.notifications.subscribe(otherSessionId, secondSubscription);
    yield* server.notifications.unsubscribe(otherSessionId, subscription.subscription.endpoint);
    expect(
      (yield* server.notifications.status(sessionId, subscription.subscription.endpoint)).enabled,
    ).toBe(true);
    yield* server.notifications.unsubscribe(sessionId, subscription.subscription.endpoint);
    yield* server.complete(1);
    expect(f.deliveries.map((d) => d.subscription.endpoint)).toEqual([
      secondSubscription.subscription.endpoint,
    ]);
  }).pipe(Effect.scoped, Effect.provide(dependencies)),
);

it.effect("rejects pages that are not served over HTTPS", () =>
  Effect.gen(function* () {
    const f = yield* fixture;
    const server = yield* f.startServer;
    for (const origin of ["http://192.168.1.4:3773", "https://t3.example.com/path"]) {
      const error = yield* server.notifications
        .subscribe(sessionId, { ...subscription, origin })
        .pipe(Effect.flip);
      expect(error.reason).toBe("insecure_origin");
    }
  }).pipe(Effect.scoped, Effect.provide(dependencies)),
);

it.effect("stops delivery after session revocation or expiry", () =>
  Effect.gen(function* () {
    const f = yield* fixture;
    const server = yield* f.startServer;
    yield* server.notifications.subscribe(sessionId, subscription);
    yield* server.notifications.subscribe(otherSessionId, secondSubscription);
    yield* f.sql`UPDATE auth_sessions SET revoked_at = '1970-01-01T00:00:00.000Z' WHERE session_id = ${sessionId}`;
    yield* f.sql`UPDATE auth_sessions SET expires_at = '1970-01-01T00:00:00.000Z' WHERE session_id = ${otherSessionId}`;
    yield* server.complete(1);
    expect(f.deliveries).toHaveLength(0);
    expect(
      (yield* server.notifications.status(sessionId, subscription.subscription.endpoint)).enabled,
    ).toBe(false);
  }).pipe(Effect.scoped, Effect.provide(dependencies)),
);

it.effect(
  "removes expired push endpoints while keeping transient delivery failures subscribed",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const server = yield* f.startServer;
      yield* server.notifications.subscribe(sessionId, subscription);
      f.setDeliveryStatus(503);
      yield* server.complete(1);
      expect(
        (yield* server.notifications.status(sessionId, subscription.subscription.endpoint)).enabled,
      ).toBe(true);
      f.setDeliveryStatus(410);
      yield* Ref.set(f.currentShell, shell({ latestRunId: runId(2) }));
      yield* server.complete(2);
      expect(
        (yield* server.notifications.status(sessionId, subscription.subscription.endpoint)).enabled,
      ).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(dependencies)),
);

it.effect("does not send completions from before this device subscribed", () =>
  Effect.gen(function* () {
    const f = yield* fixture;
    yield* TestClock.adjust("1 minute");
    const server = yield* f.startServer;
    yield* server.notifications.subscribe(sessionId, subscription);
    yield* server.complete(1, DateTime.makeUnsafe(0));
    expect(f.deliveries).toHaveLength(0);
  }).pipe(Effect.scoped, Effect.provide(dependencies)),
);

it.effect("notifies a continued run once, when the continuation completes", () =>
  Effect.gen(function* () {
    const f = yield* fixture;
    const server = yield* f.startServer;
    yield* server.notifications.subscribe(sessionId, subscription);
    yield* server.emit(runCompleted(1, yield* DateTime.now));
    yield* Ref.set(
      f.currentShell,
      shell({ status: "running", activeRunId: runId(2), latestRunId: runId(2) }),
    );
    yield* server.settle;
    expect(f.deliveries).toHaveLength(0);
    yield* Ref.set(f.currentShell, shell({ latestRunId: runId(2) }));
    yield* server.complete(2);
    expect(f.deliveries).toHaveLength(1);
  }).pipe(Effect.scoped, Effect.provide(dependencies)),
);

it.effect.each([
  { name: "stopped", thread: shell({ latestRunStopRequested: true }) },
  { name: "archived", thread: shell({ archivedAt: DateTime.makeUnsafe(0) }) },
  { name: "settled", thread: shell({ settledOverride: "settled" }) },
])("does not notify a $name thread", ({ thread }) =>
  Effect.gen(function* () {
    const f = yield* fixture;
    const server = yield* f.startServer;
    yield* server.notifications.subscribe(sessionId, subscription);
    yield* Ref.set(f.currentShell, thread);
    yield* server.complete(1);
    expect(f.deliveries).toHaveLength(0);
  }).pipe(Effect.scoped, Effect.provide(dependencies)),
);

it.effect("notifies after awaited background work ends", () =>
  Effect.gen(function* () {
    const f = yield* fixture;
    const server = yield* f.startServer;
    yield* server.notifications.subscribe(sessionId, subscription);
    yield* Ref.set(
      f.currentShell,
      shell({ pendingBackgroundTasks: [{ taskId: "watch", kind: "monitor", awaited: true }] }),
    );
    yield* server.complete(1);
    expect(f.deliveries).toHaveLength(0);

    yield* Ref.set(f.currentShell, shell());
    const now = yield* DateTime.now;
    yield* server.emit({
      id: EventId.make("event:watch:completed"),
      type: "turn-item.updated",
      threadId,
      runId: runId(1),
      occurredAt: now,
      payload: {
        id: TurnItemId.make("watch"),
        threadId,
        runId: runId(1),
        nodeId: NodeId.make("node-one"),
        providerThreadId: null,
        providerTurnId: null,
        nativeItemRef: null,
        parentItemId: null,
        ordinal: 1,
        title: null,
        startedAt: now,
        completedAt: now,
        updatedAt: now,
        type: "dynamic_tool",
        toolName: "watch",
        input: {},
        status: "completed",
      },
    });
    yield* server.settle;
    expect(f.deliveries).toHaveLength(1);
  }).pipe(Effect.scoped, Effect.provide(dependencies)),
);
