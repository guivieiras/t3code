import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { useEffect, useRef } from "react";

import { isElectron } from "../../env";
import { isLinuxPlatform } from "../../lib/utils";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { useEnvironments } from "../../state/environments";
import { environmentShell } from "../../state/shell";
import { environmentThreadDetails } from "../../state/threads";
import {
  buildLinuxCompletionNotification,
  findFinalAssistantResponsePreview,
  trackLinuxCompletionTransitions,
  type LinuxCompletion,
  type LinuxCompletionTrackerState,
} from "./LinuxDesktopCompletionNotifications.logic";

let notificationPermissionRequest: Promise<NotificationPermission> | null = null;
const FINAL_RESPONSE_WAIT_MS = 2_000;

function showCompletionNotification(input: { readonly title: string; readonly body: string }) {
  if (!("Notification" in window) || Notification.permission === "denied") {
    return;
  }

  const show = () => {
    try {
      const notification = new Notification(input.title, { body: input.body });
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

async function readFinalAssistantPreview(
  environmentId: EnvironmentId,
  completion: LinuxCompletion,
): Promise<string | null> {
  const threadAtom = environmentThreadDetails.threadAtom(
    scopeThreadRef(environmentId, completion.threadId),
  );
  const readPreview = () =>
    findFinalAssistantResponsePreview(
      appAtomRegistry.get(threadAtom)?.projection.messages ?? [],
      completion.runId,
    );
  const cachedPreview = readPreview();
  if (cachedPreview !== null) return cachedPreview;

  return await new Promise<string | null>((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | null = null;
    const finish = (preview: string | null) => {
      if (settled) return;
      settled = true;
      unsubscribe?.();
      globalThis.clearTimeout(timeoutId);
      resolve(preview);
    };
    const timeoutId = globalThis.setTimeout(() => finish(readPreview()), FINAL_RESPONSE_WAIT_MS);
    unsubscribe = appAtomRegistry.subscribe(threadAtom, () => {
      const preview = readPreview();
      if (preview !== null) finish(preview);
    });
    if (settled) unsubscribe();
  });
}

async function notifyCompletion(input: {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string | null;
  readonly projectTitle: string | null;
  readonly completion: LinuxCompletion;
}) {
  const assistantPreview = await readFinalAssistantPreview(input.environmentId, input.completion);
  showCompletionNotification(
    buildLinuxCompletionNotification({
      completion: input.completion,
      assistantPreview,
      projectTitle: input.projectTitle,
      environmentLabel: input.environmentLabel,
    }),
  );
}

function EnvironmentCompletionNotifications({
  environmentId,
  environmentLabel,
}: {
  environmentId: EnvironmentId;
  environmentLabel: string | null;
}) {
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
    const projectTitleById = new Map(
      shell.snapshot.value.projects.map((project) => [project.id, project.title]),
    );
    for (const completion of result.completions) {
      void notifyCompletion({
        environmentId,
        environmentLabel,
        projectTitle: projectTitleById.get(completion.projectId) ?? null,
        completion,
      });
    }
  }, [environmentId, environmentLabel, shell]);

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
      environmentLabel={environments.length > 1 ? environment.label : null}
    />
  ));
}
