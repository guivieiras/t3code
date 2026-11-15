import * as Schema from "effect/Schema";

import type { EnvironmentId, ThreadId } from "./baseSchemas.ts";

// Browser push services only: a paired client must not turn the server into an
// arbitrary HTTP request proxy by supplying its own subscription endpoint.
export const WebPushEndpoint = Schema.String.check(
  Schema.isMaxLength(4096),
  Schema.isPattern(
    /^https:\/\/(?:fcm\.googleapis\.com|(?:[a-z0-9-]+\.)*push\.services\.mozilla\.com|(?:[a-z0-9-]+\.)*push\.apple\.com|(?:[a-z0-9-]+\.)*notify\.windows\.com)\//,
  ),
);

export const WebPushSubscription = Schema.Struct({
  endpoint: WebPushEndpoint,
  keys: Schema.Struct({
    p256dh: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{87}=?$/)),
    auth: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{22}={0,2}$/)),
  }),
});
export type WebPushSubscription = typeof WebPushSubscription.Type;

export const WebPushSubscribeInput = Schema.Struct({
  subscription: WebPushSubscription,
  /** The web app's origin, which may differ from the server's over a relay or tunnel. */
  origin: Schema.String.check(Schema.isMaxLength(2048)),
});
export type WebPushSubscribeInput = typeof WebPushSubscribeInput.Type;

export const WebPushStatus = Schema.Struct({
  publicKey: Schema.String,
  enabled: Schema.Boolean,
});
export type WebPushStatus = typeof WebPushStatus.Type;

export const WebPushPayload = Schema.Struct({
  title: Schema.String,
  body: Schema.String,
  tag: Schema.String,
  url: Schema.String,
});

export class WebPushError extends Schema.TaggedError<WebPushError>()("WebPushError", {
  reason: Schema.Literals(["storage", "insecure_origin"]),
  cause: Schema.optionalKey(Schema.Defect()),
}) {
  override get message(): string {
    return this.reason === "insecure_origin"
      ? "Notifications require an HTTPS address."
      : "Unable to save or read notification settings.";
  }
}

const TAG_HASH_OFFSET_BASIS = 0xcbf29ce484222325n;
const TAG_HASH_PRIME = 0x100000001b3n;
const TAG_HASH_MASK = 0xffffffffffffffffn;

/**
 * Shared by open-tab and push notifications so one replaces the other. Windows drops
 * toast notifications with the 73-character environment/thread tag.
 */
export function threadNotificationTag(environmentId: EnvironmentId, threadId: ThreadId): string {
  const key = `${environmentId}:${threadId}`;
  let hash = TAG_HASH_OFFSET_BASIS;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= BigInt(key.charCodeAt(index));
    hash = (hash * TAG_HASH_PRIME) & TAG_HASH_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}
