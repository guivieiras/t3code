import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  AuthSessionId,
  EnvironmentId,
  ThreadId,
  WebPushPayload,
  type WebPushSubscribeInput,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as ServerConfig from "../config.ts";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as SqliteClient from "../persistence/NodeSqliteClient.ts";
import authMigration from "../persistence/Migrations/031_AuthAuthorizationScopes.ts";
import pushMigration from "../persistence/Migrations/053_WebPushNotifications.ts";
import { make, type CompletionNotification } from "./WebPushNotifications.ts";
import { PushDeliveryError, WebPushTransport } from "./WebPushTransport.ts";

const decodePayload = Schema.decodeUnknownEffect(Schema.fromJsonString(WebPushPayload));

const sessionId = AuthSessionId.make("browser-one");
const otherSessionId = AuthSessionId.make("browser-two");
const subscription: WebPushSubscribeInput = {
  origin: "https://t3.example.com",
  subscription: {
    endpoint: "https://fcm.googleapis.com/push/one",
    keys: { p256dh: "a".repeat(87), auth: "b".repeat(22) },
  },
};

const dependencies = Layer.mergeAll(
  SqliteClient.layer({ filename: ":memory:" }),
  ServerSecretStore.layer.pipe(
    Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "t3-web-push-test-" })),
  ),
).pipe(Layer.provideMerge(NodeServices.layer));

const fixture = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* authMigration;
  yield* pushMigration;
  const now = DateTime.formatIso(yield* DateTime.now);
  for (const id of [sessionId, otherSessionId]) {
    yield* sql`
      INSERT INTO auth_sessions (session_id, subject, scopes, method, issued_at, expires_at)
      VALUES (${id}, 'test', '["orchestration:read"]', 'browser', ${now}, '9999-01-01T00:00:00.000Z')
    `;
  }
  const deliveries: Array<Parameters<WebPushTransport["Service"]["send"]>[0]> = [];
  let deliveryStatus = 201;
  let generatedKeys = 0;
  const transport = WebPushTransport.of({
    generateKeys: Effect.sync(() => {
      generatedKeys += 1;
      return { publicKey: "public-key", privateKey: "private-key" };
    }),
    send: (input) =>
      Effect.gen(function* () {
        deliveries.push(input);
        if (deliveryStatus !== 201)
          return yield* new PushDeliveryError({ statusCode: deliveryStatus });
      }),
  });
  const createService = make.pipe(Effect.provideService(WebPushTransport, transport));
  const notifications = yield* createService;
  const completion: CompletionNotification = {
    environmentId: EnvironmentId.make("environment-one"),
    threadId: ThreadId.make("thread-one"),
    runOrdinal: 1,
    completedAt: now,
    title: "Implement notifications",
    body: "Agent turn completed. · T3",
  };
  return {
    sql,
    notifications,
    createService,
    deliveries,
    completion,
    setDeliveryStatus: (status: number) => {
      deliveryStatus = status;
    },
    generatedKeys: () => generatedKeys,
  };
});

it.effect(
  "persists subscriptions and keys across restarts and notifies once per completed run",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      yield* f.notifications.subscribe(sessionId, subscription);
      const restarted = yield* f.createService;
      expect(yield* restarted.status(sessionId, subscription.subscription.endpoint)).toEqual({
        publicKey: "public-key",
        enabled: true,
      });
      expect(f.generatedKeys()).toBe(1);
      yield* restarted.complete(f.completion);
      yield* restarted.complete(f.completion);
      const restartedAgain = yield* f.createService;
      yield* restartedAgain.complete(f.completion);
      expect(f.deliveries).toHaveLength(1);
      const payload = yield* decodePayload(f.deliveries[0]!.payload);
      expect(payload.url).toBe("https://t3.example.com/environment-one/thread-one");
      expect(payload.title).toBe(f.completion.title);
      yield* restartedAgain.complete({ ...f.completion, runOrdinal: 2 });
      expect(f.deliveries).toHaveLength(2);
    }).pipe(Effect.provide(dependencies)),
);

it.effect("keeps device subscriptions separate and only lets their session disable them", () =>
  Effect.gen(function* () {
    const f = yield* fixture;
    const second = {
      ...subscription,
      subscription: { ...subscription.subscription, endpoint: "https://web.push.apple.com/second" },
    };
    yield* f.notifications.subscribe(sessionId, subscription);
    yield* f.notifications.subscribe(otherSessionId, second);
    yield* f.notifications.unsubscribe(otherSessionId, subscription.subscription.endpoint);
    expect(
      (yield* f.notifications.status(sessionId, subscription.subscription.endpoint)).enabled,
    ).toBe(true);
    yield* f.notifications.unsubscribe(sessionId, subscription.subscription.endpoint);
    yield* f.notifications.complete(f.completion);
    expect(f.deliveries.map((d) => d.subscription.endpoint)).toEqual([
      second.subscription.endpoint,
    ]);
  }).pipe(Effect.provide(dependencies)),
);

it.effect("stops delivery after session revocation or expiry", () =>
  Effect.gen(function* () {
    const f = yield* fixture;
    yield* f.notifications.subscribe(sessionId, subscription);
    yield* f.notifications.subscribe(otherSessionId, {
      ...subscription,
      subscription: { ...subscription.subscription, endpoint: "https://web.push.apple.com/second" },
    });
    yield* f.sql`UPDATE auth_sessions SET revoked_at = '1970-01-01T00:00:00.000Z' WHERE session_id = ${sessionId}`;
    yield* f.sql`UPDATE auth_sessions SET expires_at = '1970-01-01T00:00:00.000Z' WHERE session_id = ${otherSessionId}`;
    yield* f.notifications.complete(f.completion);
    expect(f.deliveries).toHaveLength(0);
    expect(
      (yield* f.notifications.status(sessionId, subscription.subscription.endpoint)).enabled,
    ).toBe(false);
  }).pipe(Effect.provide(dependencies)),
);

it.effect(
  "removes expired push endpoints while keeping transient delivery failures subscribed",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      yield* f.notifications.subscribe(sessionId, subscription);
      f.setDeliveryStatus(503);
      yield* f.notifications.complete(f.completion);
      expect(
        (yield* f.notifications.status(sessionId, subscription.subscription.endpoint)).enabled,
      ).toBe(true);
      f.setDeliveryStatus(410);
      yield* f.notifications.complete({ ...f.completion, runOrdinal: 2 });
      expect(
        (yield* f.notifications.status(sessionId, subscription.subscription.endpoint)).enabled,
      ).toBe(false);
    }).pipe(Effect.provide(dependencies)),
);

it.effect("does not send completions from before this device subscribed", () =>
  Effect.gen(function* () {
    const f = yield* fixture;
    yield* f.notifications.subscribe(sessionId, subscription);
    yield* f.notifications.complete({ ...f.completion, completedAt: "1969-12-31T23:59:59.000Z" });
    expect(f.deliveries).toHaveLength(0);
  }).pipe(Effect.provide(dependencies)),
);
