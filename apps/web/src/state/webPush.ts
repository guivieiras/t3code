import { WS_METHODS } from "@t3tools/contracts";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

export const webPushStatus = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:web-push:status",
  tag: WS_METHODS.webPushStatus,
});

export const webPushSubscribe = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:web-push:subscribe",
  tag: WS_METHODS.webPushSubscribe,
});

export const webPushUnsubscribe = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:web-push:unsubscribe",
  tag: WS_METHODS.webPushUnsubscribe,
});
