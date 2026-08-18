import type { MessageId, OrchestrationThreadShell, ProjectId, ThreadId } from "@t3tools/contracts";

type CompletionThread = Pick<
  OrchestrationThreadShell,
  "id" | "projectId" | "title" | "branch" | "archivedAt" | "latestTurn"
>;

interface ObservedTurn {
  readonly turnId: string;
  readonly state: "running" | "interrupted" | "completed" | "error";
}

export type LinuxCompletionTrackerState = ReadonlyMap<string, ObservedTurn>;

export interface LinuxCompletion {
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly threadTitle: string;
  readonly branch: string | null;
  readonly assistantMessageId: MessageId | null;
  readonly startedAt: string | null;
  readonly completedAt: string;
}

export interface LinuxCompletionTransitionResult {
  readonly nextState: LinuxCompletionTrackerState;
  readonly completions: ReadonlyArray<LinuxCompletion>;
}

export const FINAL_RESPONSE_PREVIEW_MAX_LENGTH = 220;

export function compactFinalResponsePreview(
  text: string,
  maxLength = FINAL_RESPONSE_PREVIEW_MAX_LENGTH,
): string | null {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length === 0) return null;
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function formatTurnDuration(startedAt: string | null, completedAt: string): string | null {
  if (startedAt === null) return null;
  const durationMs = Date.parse(completedAt) - Date.parse(startedAt);
  if (!Number.isFinite(durationMs) || durationMs < 0) return null;
  if (durationMs < 1_000) return "<1s";

  const totalSeconds = Math.round(durationMs / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  return `${seconds}s`;
}

export function buildLinuxCompletionNotification(input: {
  readonly completion: LinuxCompletion;
  readonly assistantPreview: string | null;
  readonly projectTitle: string | null;
  readonly environmentLabel: string | null;
}): { readonly title: string; readonly body: string } {
  const duration = formatTurnDuration(input.completion.startedAt, input.completion.completedAt);
  const metadata = [
    input.projectTitle,
    input.completion.branch,
    duration,
    input.environmentLabel,
  ].filter((value): value is string => value !== null && value.length > 0);
  const metadataLine = metadata.join(" · ");
  const body = [input.assistantPreview, metadataLine]
    .filter((value): value is string => value !== null && value.length > 0)
    .join("\n");

  return {
    title: input.completion.threadTitle,
    body: body || "Agent turn completed.",
  };
}

/**
 * Finds turns that this client observed move directly from running to
 * completed. A null previous state seeds the tracker without notifying, which
 * keeps cached snapshots and reconnect hydration from producing stale alerts.
 */
export function trackLinuxCompletionTransitions(
  previousState: LinuxCompletionTrackerState | null,
  threads: ReadonlyArray<CompletionThread>,
): LinuxCompletionTransitionResult {
  const nextState = new Map<string, ObservedTurn>();
  const completions: Array<LinuxCompletion> = [];

  for (const thread of threads) {
    const latestTurn = thread.latestTurn;
    if (latestTurn === null) continue;

    nextState.set(thread.id, {
      turnId: latestTurn.turnId,
      state: latestTurn.state,
    });

    const previousTurn = previousState?.get(thread.id);
    if (
      thread.archivedAt === null &&
      latestTurn.state === "completed" &&
      latestTurn.completedAt !== null &&
      previousTurn?.turnId === latestTurn.turnId &&
      previousTurn.state === "running"
    ) {
      completions.push({
        threadId: thread.id,
        projectId: thread.projectId,
        threadTitle: thread.title,
        branch: thread.branch,
        assistantMessageId: latestTurn.assistantMessageId,
        startedAt: latestTurn.startedAt,
        completedAt: latestTurn.completedAt,
      });
    }
  }

  return { nextState, completions };
}
