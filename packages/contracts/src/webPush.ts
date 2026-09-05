import * as Schema from "effect/Schema";

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

export class WebPushError extends Schema.TaggedErrorClass<WebPushError>()("WebPushError", {
  message: Schema.String,
}) {}
