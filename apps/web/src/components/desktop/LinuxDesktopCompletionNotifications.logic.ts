import type { OrchestrationThreadShell } from "@t3tools/contracts";

type CompletionThread = Pick<OrchestrationThreadShell, "id" | "archivedAt" | "latestTurn">;

interface ObservedTurn {
  readonly turnId: string;
  readonly state: "running" | "interrupted" | "completed" | "error";
}

export type LinuxCompletionTrackerState = ReadonlyMap<string, ObservedTurn>;

export interface LinuxCompletionTransitionResult {
  readonly nextState: LinuxCompletionTrackerState;
  readonly completedThreadIds: ReadonlyArray<string>;
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
  const completedThreadIds: Array<string> = [];

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
      completedThreadIds.push(thread.id);
    }
  }

  return { nextState, completedThreadIds };
}
