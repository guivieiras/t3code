import type {
  OrchestrationV2ConversationMessage,
  OrchestrationV2ThreadShell,
  ProjectId,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

type CompletionThread = Pick<
  OrchestrationV2ThreadShell,
  | "id"
  | "projectId"
  | "title"
  | "branch"
  | "archivedAt"
  | "latestRunId"
  | "latestRunStartedAt"
  | "latestRunCompletedAt"
  | "status"
>;

interface ObservedRun {
  readonly runId: string;
  readonly state: CompletionThread["status"];
}

export type LinuxCompletionTrackerState = ReadonlyMap<string, ObservedRun>;

export interface LinuxCompletion {
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly runId: RunId;
  readonly threadTitle: string;
  readonly branch: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string;
}

export interface LinuxCompletionTransitionResult {
  readonly nextState: LinuxCompletionTrackerState;
  readonly completions: ReadonlyArray<LinuxCompletion>;
}

export const FINAL_RESPONSE_PREVIEW_MAX_LENGTH = 220;

const RUN_STATUSES_THAT_CAN_COMPLETE = new Set<CompletionThread["status"]>([
  "preparing",
  "queued",
  "starting",
  "running",
  "waiting",
]);

export function compactFinalResponsePreview(
  text: string,
  maxLength = FINAL_RESPONSE_PREVIEW_MAX_LENGTH,
): string | null {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length === 0) return null;
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

type CompletionPreviewMessage = Pick<
  OrchestrationV2ConversationMessage,
  "role" | "runId" | "streaming" | "text"
>;

export function findFinalAssistantResponsePreview(
  messages: ReadonlyArray<CompletionPreviewMessage>,
  runId: RunId,
): string | null {
  const message = messages.findLast(
    (candidate) =>
      candidate.runId === runId && candidate.role === "assistant" && !candidate.streaming,
  );
  return message === undefined ? null : compactFinalResponsePreview(message.text);
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
 * Finds runs that this client observed move from active work to completed. V2
 * parks successful runs at waiting during checkpoint capture, so completion
 * must accept every non-terminal run state rather than only running. A null
 * previous state seeds the tracker without notifying, which keeps cached
 * snapshots and reconnect hydration from producing stale alerts.
 */
export function trackLinuxCompletionTransitions(
  previousState: LinuxCompletionTrackerState | null,
  threads: ReadonlyArray<CompletionThread>,
): LinuxCompletionTransitionResult {
  const nextState = new Map<string, ObservedRun>();
  const completions: Array<LinuxCompletion> = [];

  for (const thread of threads) {
    const latestRunId = thread.latestRunId;
    if (latestRunId === null) continue;

    nextState.set(thread.id, {
      runId: latestRunId,
      state: thread.status,
    });

    const previousRun = previousState?.get(thread.id);
    if (
      thread.archivedAt === null &&
      thread.status === "completed" &&
      thread.latestRunCompletedAt != null &&
      previousRun?.runId === latestRunId &&
      RUN_STATUSES_THAT_CAN_COMPLETE.has(previousRun.state)
    ) {
      completions.push({
        threadId: thread.id,
        projectId: thread.projectId,
        runId: latestRunId,
        threadTitle: thread.title,
        branch: thread.branch,
        startedAt:
          thread.latestRunStartedAt == null ? null : DateTime.formatIso(thread.latestRunStartedAt),
        completedAt: DateTime.formatIso(thread.latestRunCompletedAt),
      });
    }
  }

  return { nextState, completions };
}
