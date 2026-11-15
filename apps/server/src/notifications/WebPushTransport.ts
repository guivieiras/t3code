import type { WebPushSubscription } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import webpush from "web-push";

export const VapidKeys = Schema.Struct({ publicKey: Schema.String, privateKey: Schema.String });
export type VapidKeys = typeof VapidKeys.Type;

export class PushDeliveryError extends Schema.TaggedError<PushDeliveryError>()(
  "PushDeliveryError",
  {
    statusCode: Schema.NullOr(Schema.Number),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Web Push delivery failed${this.statusCode === null ? "" : ` (${this.statusCode})`}.`;
  }
}

export class WebPushTransport extends Context.Service<
  WebPushTransport,
  {
    readonly generateKeys: Effect.Effect<VapidKeys>;
    readonly send: (input: {
      readonly subscription: WebPushSubscription;
      readonly keys: VapidKeys;
      /** The web app origin, used as the VAPID subject push services can contact. */
      readonly origin: string;
      readonly payload: string;
    }) => Effect.Effect<void, PushDeliveryError>;
  }
>()("t3/notifications/WebPushTransport") {}

export const layer = Layer.succeed(WebPushTransport, {
  generateKeys: Effect.sync(() => webpush.generateVAPIDKeys()),
  send: Effect.fn("WebPushTransport.send")(function* (input) {
    yield* Effect.tryPromise({
      try: () =>
        webpush.sendNotification(input.subscription, input.payload, {
          vapidDetails: { ...input.keys, subject: input.origin },
          TTL: 3600,
          urgency: "high",
          timeout: 10_000,
        }),
      catch: (cause) =>
        new PushDeliveryError({
          statusCode: cause instanceof webpush.WebPushError ? cause.statusCode : null,
          cause,
        }),
    });
  }),
});
