import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { useEffect, useRef } from "react";

import { APP_DISPLAY_NAME } from "../../branding";
import { isElectron } from "../../env";
import { isLinuxPlatform } from "../../lib/utils";
import { useEnvironments } from "../../state/environments";
import { environmentShell } from "../../state/shell";
import {
  trackLinuxCompletionTransitions,
  type LinuxCompletionTrackerState,
} from "./LinuxDesktopCompletionNotifications.logic";

let notificationPermissionRequest: Promise<NotificationPermission> | null = null;

function showCompletionNotification() {
  if (!("Notification" in window) || Notification.permission === "denied") {
    return;
  }

  const show = () => {
    try {
      const notification = new Notification(APP_DISPLAY_NAME, {
        body: "An agent turn completed.",
      });
      void notification;
    } catch {
      // Desktop notifications are best-effort; a missing notification daemon
      // should not surface as an application error.
    }
  };

  if (Notification.permission === "granted") {
    show();
    return;
  }

  notificationPermissionRequest ??= Notification.requestPermission();
  void notificationPermissionRequest.then((permission) => {
    if (permission === "granted") show();
  });
}

function EnvironmentCompletionNotifications({ environmentId }: { environmentId: EnvironmentId }) {
  const shell = useAtomValue(environmentShell.stateValueAtom(environmentId));
  const trackerRef = useRef<LinuxCompletionTrackerState | null>(null);

  useEffect(() => {
    if (shell.status !== "live" || Option.isNone(shell.snapshot)) {
      trackerRef.current = null;
      return;
    }

    const result = trackLinuxCompletionTransitions(
      trackerRef.current,
      shell.snapshot.value.threads,
    );
    trackerRef.current = result.nextState;
    for (const _threadId of result.completedThreadIds) {
      showCompletionNotification();
    }
  }, [shell]);

  return null;
}

export function LinuxDesktopCompletionNotifications() {
  const { environments } = useEnvironments();
  const isLinuxDesktop =
    isElectron && isLinuxPlatform(`${navigator.platform} ${navigator.userAgent}`);

  if (!isLinuxDesktop) {
    return null;
  }

  return environments.map((environment) => (
    <EnvironmentCompletionNotifications
      key={environment.environmentId}
      environmentId={environment.environmentId}
    />
  ));
}
