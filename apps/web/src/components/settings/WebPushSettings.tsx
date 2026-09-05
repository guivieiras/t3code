import { useEffect, useState } from "react";
import {
  WS_METHODS,
  WebPushSubscription,
  type EnvironmentId,
  type WebPushStatus,
} from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import * as Schema from "effect/Schema";
import { connectionAtomRuntime } from "../../connection/runtime";
import { isElectron } from "../../env";
import { useEnvironments } from "../../state/environments";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  notificationAvailability,
  readNotificationSubscription,
  subscribeToNotifications,
} from "../../webPush";
import { Button } from "../ui/button";
import { SettingsRow, SettingsSection } from "./settingsLayout";

const decodeSubscription = Schema.decodeUnknownSync(WebPushSubscription);

const commands = {
  status: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "web-push:status",
    tag: WS_METHODS.webPushStatus,
  }),
  subscribe: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "web-push:subscribe",
    tag: WS_METHODS.webPushSubscribe,
  }),
  unsubscribe: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "web-push:unsubscribe",
    tag: WS_METHODS.webPushUnsubscribe,
  }),
};

function unwrap<A, E>(result: AtomCommandResult<A, E>): A {
  if (result._tag === "Failure") throw squashAtomCommandFailure(result);
  return result.value;
}

function EnvironmentNotifications({
  environmentId,
  label,
}: {
  environmentId: EnvironmentId;
  label: string;
}) {
  const getStatus = useAtomCommand(commands.status);
  const subscribe = useAtomCommand(commands.subscribe);
  const unsubscribe = useAtomCommand(commands.unsubscribe);
  const [status, setStatus] = useState<WebPushStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unavailable = notificationAvailability();

  useEffect(() => {
    if (unavailable) return;
    let disposed = false;
    void (async () => {
      try {
        const subscription = await readNotificationSubscription(environmentId);
        const result = unwrap(
          await getStatus({ environmentId, input: { endpoint: subscription?.endpoint ?? null } }),
        );
        if (!disposed) setStatus(result);
      } catch (cause) {
        if (!disposed)
          setError(
            cause instanceof Error ? cause.message : "Unable to read notification settings.",
          );
      } finally {
        if (!disposed) setLoading(false);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [environmentId, getStatus, unavailable]);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (status?.enabled) {
        const subscription = await readNotificationSubscription(environmentId);
        if (subscription) {
          unwrap(await unsubscribe({ environmentId, input: { endpoint: subscription.endpoint } }));
          await subscription.unsubscribe();
        }
        setStatus({ ...status, enabled: false });
      } else {
        // Request permission directly from the tap, before any server request.
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Notification permission was not granted.");
        const current = unwrap(await getStatus({ environmentId, input: { endpoint: null } }));
        const subscription = await subscribeToNotifications(environmentId, current.publicKey);
        unwrap(
          await subscribe({
            environmentId,
            input: {
              subscription: decodeSubscription(subscription.toJSON()),
              origin: window.location.origin,
            },
          }),
        );
        setStatus({ ...current, enabled: true });
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to update notifications. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsRow
      title={label}
      description={
        <>
          <span>
            {unavailable ??
              (status?.enabled
                ? "Enabled on this device. Completed turns will notify you even when T3 is closed."
                : "Receive a notification on this device when an agent turn completes.")}
          </span>
          {error ? (
            <span role="alert" className="mt-1 block text-destructive">
              {error}
            </span>
          ) : null}
        </>
      }
      control={
        <Button
          variant="outline"
          disabled={loading || busy || unavailable !== null}
          onClick={() => void toggle()}
        >
          {unavailable
            ? "Unavailable"
            : loading
              ? "Checking…"
              : busy
                ? "Saving…"
                : status?.enabled
                  ? "Disable notifications"
                  : "Enable notifications"}
        </Button>
      }
    />
  );
}

export function WebPushSettings() {
  const { environments } = useEnvironments();
  return (
    <SettingsSection id="completion-notifications" title="Completion notifications">
      {isElectron ? (
        <p className="text-sm text-muted-foreground">
          Web Push is available when you open T3 in a browser. Desktop notifications use the desktop
          app.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            On iPhone, add T3 to the Home Screen and open it there before enabling notifications.
            Your T3 server and phone need internet access.
          </p>
          {environments.map((environment) => (
            <EnvironmentNotifications
              key={environment.environmentId}
              environmentId={environment.environmentId}
              label={environment.label}
            />
          ))}
        </>
      )}
    </SettingsSection>
  );
}
