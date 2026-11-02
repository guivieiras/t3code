import { useAtomValue } from "@effect/atom-react";
import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { WebPushSubscription, type EnvironmentId, type WebPushStatus } from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { useEffect, useState } from "react";

import { isElectron } from "../../env";
import { useEnvironments } from "../../state/environments";
import { useAtomCommand } from "../../state/use-atom-command";
import { webPushStatus, webPushSubscribe, webPushUnsubscribe } from "../../state/webPush";
import {
  notificationAvailability,
  readNotificationSubscription,
  subscribeToNotifications,
} from "../../webPush";
import { Switch } from "../ui/switch";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

const decodeSubscription = Schema.decodeUnknownOption(WebPushSubscription);

function unwrap<A, E>(result: AtomCommandResult<A, E>): A {
  if (result._tag === "Failure") throw squashAtomCommandFailure(result);
  return result.value;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "Unable to update notifications. Please try again.";
}

function useWebPushCommands() {
  return {
    getStatus: useAtomCommand(webPushStatus, { reportFailure: false }),
    subscribe: useAtomCommand(webPushSubscribe, { reportFailure: false }),
    unsubscribe: useAtomCommand(webPushUnsubscribe, { reportFailure: false }),
  };
}
type WebPushCommands = ReturnType<typeof useWebPushCommands>;

async function readStatus(commands: WebPushCommands, environmentId: EnvironmentId) {
  const subscription = await readNotificationSubscription(environmentId);
  return unwrap(
    await commands.getStatus({
      environmentId,
      input: { endpoint: subscription?.endpoint ?? null },
    }),
  );
}

async function enableNotifications(commands: WebPushCommands, environmentId: EnvironmentId) {
  // Ask before any server round trip: Safari only prompts from a direct tap.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");
  const current = unwrap(await commands.getStatus({ environmentId, input: { endpoint: null } }));
  const subscription = await subscribeToNotifications(environmentId, current.publicKey);
  const decoded = decodeSubscription(subscription.toJSON());
  if (Option.isNone(decoded)) {
    await subscription.unsubscribe();
    throw new Error("This browser's push service is not supported.");
  }
  unwrap(
    await commands.subscribe({
      environmentId,
      input: { subscription: decoded.value, origin: window.location.origin },
    }),
  );
  return { ...current, enabled: true };
}

async function disableNotifications(
  commands: WebPushCommands,
  environmentId: EnvironmentId,
  current: WebPushStatus | null,
) {
  const subscription = await readNotificationSubscription(environmentId);
  if (subscription) {
    unwrap(
      await commands.unsubscribe({ environmentId, input: { endpoint: subscription.endpoint } }),
    );
    await subscription.unsubscribe();
  }
  return current && { ...current, enabled: false };
}

function EnvironmentPushNotifications({
  environmentId,
  label,
  anchored,
  labelled,
}: {
  environmentId: EnvironmentId;
  label: string;
  anchored: boolean;
  labelled: boolean;
}) {
  const commands = useWebPushCommands();
  const allowed = useAtomValue(webPushSubscribe.permissionAtom(environmentId));
  const unavailable = notificationAvailability();
  const [status, setStatus] = useState<WebPushStatus | null>(null);
  const [busy, setBusy] = useState(unavailable === null);
  const [error, setError] = useState<string | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads this browser's push subscription, which lives in its service worker registration
  useEffect(() => {
    if (unavailable) return;
    let disposed = false;
    readStatus(commands, environmentId).then(
      (result) => {
        if (disposed) return;
        setStatus(result);
        setBusy(false);
      },
      (cause: unknown) => {
        if (disposed) return;
        setError(messageOf(cause));
        setBusy(false);
      },
    );
    return () => {
      disposed = true;
    };
  }, [commands, environmentId, unavailable]);

  const toggle = (enable: boolean) => {
    setBusy(true);
    setError(null);
    (enable
      ? enableNotifications(commands, environmentId)
      : disableNotifications(commands, environmentId, status)
    ).then(
      (next) => {
        setStatus(next);
        setBusy(false);
      },
      (cause: unknown) => {
        setError(messageOf(cause));
        setBusy(false);
      },
    );
  };

  const searchable = searchableSetting("push-notifications");
  return (
    <SettingsRow
      {...(anchored ? { id: searchable.id } : {})}
      title={labelled ? `${searchable.title} (${label})` : searchable.title}
      description={
        <>
          {unavailable ??
            (allowed
              ? "Notify this browser when an agent turn finishes, even when T3 Code is closed."
              : "This connection cannot turn on push notifications.")}
          {error ? (
            <span role="alert" className="mt-1 block text-destructive">
              {error}
            </span>
          ) : null}
        </>
      }
      control={
        <Switch
          checked={status?.enabled === true}
          disabled={busy || !allowed || unavailable !== null}
          onCheckedChange={toggle}
          aria-label={labelled ? `Push notifications for ${label}` : "Push notifications"}
        />
      }
    />
  );
}

/** Browser only: the desktop app already shows native notifications, and Electron has no push service. */
export function PushNotificationSettings() {
  const { environments } = useEnvironments();
  if (isElectron) return null;
  const connected = environments.filter(
    (environment) => environment.connection.phase === "connected",
  );
  return connected.map((environment, index) => (
    <EnvironmentPushNotifications
      key={environment.environmentId}
      environmentId={environment.environmentId}
      label={environment.label}
      anchored={index === 0}
      labelled={connected.length > 1}
    />
  ));
}
