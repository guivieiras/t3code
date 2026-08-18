import type { OrchestrationThreadShell } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  trackLinuxCompletionTransitions,
  type LinuxCompletionTrackerState,
} from "./LinuxDesktopCompletionNotifications.logic";

type CompletionThread = Pick<OrchestrationThreadShell, "id" | "archivedAt" | "latestTurn">;

function thread(
  state: NonNullable<OrchestrationThreadShell["latestTurn"]>["state"],
  options: {
    readonly threadId?: string;
    readonly turnId?: string;
    readonly archived?: boolean;
  } = {},
): CompletionThread {
  return {
    id: (options.threadId ?? "thread-1") as OrchestrationThreadShell["id"],
    archivedAt: options.archived ? "2026-08-18T12:00:00.000Z" : null,
    latestTurn: {
      turnId: (options.turnId ?? "turn-1") as NonNullable<
        OrchestrationThreadShell["latestTurn"]
      >["turnId"],
      state,
      requestedAt: "2026-08-18T11:00:00.000Z",
      startedAt: "2026-08-18T11:00:01.000Z",
      completedAt: state === "completed" ? "2026-08-18T12:00:00.000Z" : null,
      assistantMessageId: null,
    },
  };
}

function observe(
  previousState: LinuxCompletionTrackerState | null,
  threads: ReadonlyArray<CompletionThread>,
) {
  return trackLinuxCompletionTransitions(previousState, threads);
}

describe("LinuxDesktopCompletionNotifications.logic", () => {
  it("seeds completed turns without notifying during hydration", () => {
    expect(observe(null, [thread("completed")]).completedThreadIds).toEqual([]);
  });

  it("notifies once when an observed running turn completes", () => {
    const running = observe(null, [thread("running")]);
    const completed = observe(running.nextState, [thread("completed")]);
    const repeated = observe(completed.nextState, [thread("completed")]);

    expect(completed.completedThreadIds).toEqual(["thread-1"]);
    expect(repeated.completedThreadIds).toEqual([]);
  });

  it("does not notify for a different turn first seen completed after reconnect", () => {
    const running = observe(null, [thread("running", { turnId: "turn-1" })]);
    const completed = observe(running.nextState, [thread("completed", { turnId: "turn-2" })]);

    expect(completed.completedThreadIds).toEqual([]);
  });

  it("does not notify for errors, interruptions, or archived threads", () => {
    const running = observe(null, [
      thread("running", { threadId: "error" }),
      thread("running", { threadId: "interrupted" }),
      thread("running", { threadId: "archived" }),
    ]);
    const settled = observe(running.nextState, [
      thread("error", { threadId: "error" }),
      thread("interrupted", { threadId: "interrupted" }),
      thread("completed", { threadId: "archived", archived: true }),
    ]);

    expect(settled.completedThreadIds).toEqual([]);
  });
});
