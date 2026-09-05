import type { WebPushSubscription } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import webpush from "web-push";

export const VapidKeys = Schema.Struct({ publicKey: Schema.String, privateKey: Schema.String });
export type VapidKeys = typeof VapidKeys.Type;

export class PushDeliveryError extends Schema.TaggedErrorClass<PushDeliveryError>()(
  "PushDeliveryError",
  { statusCode: Schema.NullOr(Schema.Number) },
) {}

export class WebPushTransport extends Context.Service<
  WebPushTransport,
  {
    readonly generateKeys: Effect.Effect<VapidKeys>;
    readonly send: (input: {
      readonly subscription: WebPushSubscription;
      readonly keys: VapidKeys;
      readonly origin: string;
      readonly payload: string;
    }) => Effect.Effect<void, PushDeliveryError>;
  }
>()("t3/notifications/WebPushTransport") {}

export const layer = Layer.succeed(WebPushTransport, {
  generateKeys: Effect.sync(() => webpush.generateVAPIDKeys()),
  send: (input) =>
    Effect.tryPromise({
      try: () =>
        webpush.sendNotification(input.subscription, input.payload, {
          vapidDetails: { ...input.keys, subject: input.origin },
          TTL: 3600,
          urgency: "high",
          timeout: 10_000,
        }),
      catch: (error) =>
        new PushDeliveryError({
          statusCode: error instanceof webpush.WebPushError ? error.statusCode : null,
        }),
    }).pipe(Effect.asVoid),
});
