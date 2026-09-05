import {
  type AuthSessionId,
  type EnvironmentId,
  type ThreadId,
  type WebPushSubscribeInput,
  type WebPushStatus,
  WebPushError,
  WebPushPayload,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import { VapidKeys, WebPushTransport } from "./WebPushTransport.ts";

export interface CompletionNotification {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly runOrdinal: number;
  readonly completedAt: string;
  readonly title: string;
  readonly body: string;
}

interface SubscriptionRow {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly origin: string;
}

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
    readonly complete: (input: CompletionNotification) => Effect.Effect<void, WebPushError>;
  }
>()("t3/notifications/WebPushNotifications") {}

const decodeKeys = Schema.decodeUnknownEffect(Schema.fromJsonString(VapidKeys));
const encodeKeys = Schema.encodeEffect(Schema.fromJsonString(VapidKeys));
const encodePayload = Schema.encodeSync(Schema.fromJsonString(WebPushPayload));

const storageError = () =>
  new WebPushError({ message: "Unable to save or read notification settings." });

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const secrets = yield* ServerSecretStore.ServerSecretStore;
  const transport = yield* WebPushTransport;
  const keyLock = yield* Semaphore.make(1);
  let cachedKeys: VapidKeys | undefined;
  const getKeys = keyLock
    .withPermits(1)(
      Effect.gen(function* () {
        if (cachedKeys) return cachedKeys;
        const stored = yield* secrets.get("web-push-vapid.json");
        const keys = Option.isSome(stored)
          ? yield* decodeKeys(new TextDecoder().decode(stored.value))
          : yield* transport.generateKeys;
        if (Option.isNone(stored)) {
          yield* secrets.set(
            "web-push-vapid.json",
            new TextEncoder().encode(yield* encodeKeys(keys)),
          );
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
    const origin = yield* Effect.try({
      try: () => {
        const url = new URL(input.origin);
        if (url.origin !== input.origin || url.protocol !== "https:") throw new Error("origin");
        return url.origin;
      },
      catch: () => new WebPushError({ message: "Notifications require an HTTPS address." }),
    });
    const now = DateTime.formatIso(yield* DateTime.now);
    yield* getKeys;
    yield* sql`
      INSERT INTO web_push_subscriptions (endpoint, session_id, p256dh, auth, origin, created_at)
      VALUES (${input.subscription.endpoint}, ${sessionId}, ${input.subscription.keys.p256dh},
        ${input.subscription.keys.auth}, ${origin}, ${now})
      ON CONFLICT(endpoint) DO UPDATE SET session_id = excluded.session_id,
        p256dh = excluded.p256dh, auth = excluded.auth, origin = excluded.origin
    `.pipe(Effect.mapError(storageError));
  });

  const unsubscribe = Effect.fn("WebPushNotifications.unsubscribe")(function* (
    sessionId: AuthSessionId,
    endpoint: string,
  ) {
    yield* sql`DELETE FROM web_push_subscriptions WHERE session_id = ${sessionId} AND endpoint = ${endpoint}`.pipe(
      Effect.mapError(storageError),
    );
  });

  const complete = Effect.fn("WebPushNotifications.complete")(function* (
    input: CompletionNotification,
  ) {
    const subscriptions = yield* sql`SELECT 1 FROM web_push_subscriptions LIMIT 1`.pipe(
      Effect.mapError(storageError),
    );
    if (subscriptions.length === 0) return;
    const now = DateTime.formatIso(yield* DateTime.now);
    const recipients = yield* sql
      .withTransaction(
        Effect.gen(function* () {
          const claimed = yield* sql`
        INSERT INTO web_push_completions (thread_id, run_ordinal)
        VALUES (${input.threadId}, ${input.runOrdinal})
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
        SELECT p.endpoint, p.p256dh, p.auth, p.origin FROM web_push_subscriptions p
        JOIN auth_sessions s ON s.session_id = p.session_id
        WHERE s.revoked_at IS NULL AND s.expires_at > ${now} AND p.created_at <= ${input.completedAt}
      `;
        }),
      )
      .pipe(Effect.mapError(storageError));
    if (recipients.length === 0) return;
    const keys = yield* getKeys;
    yield* Effect.forEach(
      recipients,
      (row) =>
        transport
          .send({
            subscription: { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            keys,
            origin: row.origin,
            payload: encodePayload({
              title: input.title,
              body: input.body,
              tag: `${input.environmentId}:${input.threadId}:${input.runOrdinal}`,
              url: `${row.origin}/${encodeURIComponent(input.environmentId)}/${encodeURIComponent(input.threadId)}`,
            }),
          })
          .pipe(
            Effect.catch((error) => {
              if (error.statusCode === 404 || error.statusCode === 410) {
                return sql`DELETE FROM web_push_subscriptions WHERE endpoint = ${row.endpoint}`.pipe(
                  Effect.mapError(storageError),
                  Effect.asVoid,
                );
              }
              // Never log endpoints or encryption keys. Delivery is best-effort and
              // must not delay orchestration or surface provider errors to clients.
              return Effect.logWarning("Web Push delivery failed", {
                statusCode: error.statusCode,
              });
            }),
          ),
      { concurrency: 4, discard: true },
    );
  });

  return WebPushNotifications.of({ status, subscribe, unsubscribe, complete });
});

export const layer = Layer.effect(WebPushNotifications, make);
