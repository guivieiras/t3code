import type { OrchestrationV2ThreadShell } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import {
  buildLinuxCompletionNotification,
  compactFinalResponsePreview,
  formatTurnDuration,
  trackLinuxCompletionTransitions,
  type LinuxCompletionTrackerState,
} from "./LinuxDesktopCompletionNotifications.logic";

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
  | "latestVisibleMessage"
  | "status"
>;

function thread(
  state: CompletionThread["status"],
  options: {
    readonly threadId?: string;
    readonly runId?: string;
    readonly archived?: boolean;
  } = {},
): CompletionThread {
  return {
    id: (options.threadId ?? "thread-1") as OrchestrationV2ThreadShell["id"],
    projectId: "project-1" as OrchestrationV2ThreadShell["projectId"],
    title: "Improve Linux notifications",
    branch: "local/linux-notifications",
    archivedAt: options.archived ? DateTime.makeUnsafe("2026-08-18T12:00:00.000Z") : null,
    latestRunId: (options.runId ?? "run-1") as OrchestrationV2ThreadShell["latestRunId"],
    latestRunStartedAt: DateTime.makeUnsafe("2026-08-18T11:00:01.000Z"),
    latestRunCompletedAt:
      state === "completed" ? DateTime.makeUnsafe("2026-08-18T12:00:00.000Z") : null,
    latestVisibleMessage: {
      id: "message-1" as NonNullable<OrchestrationV2ThreadShell["latestVisibleMessage"]>["id"],
      role: "assistant",
      text: "Done",
      updatedAt: DateTime.makeUnsafe("2026-08-18T12:00:00.000Z"),
    },
    status: state,
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
    expect(observe(null, [thread("completed")]).completions).toEqual([]);
  });

  it("notifies once when an observed running turn completes", () => {
    const running = observe(null, [thread("running")]);
    const completed = observe(running.nextState, [thread("completed")]);
    const repeated = observe(completed.nextState, [thread("completed")]);

    expect(completed.completions).toEqual([
      expect.objectContaining({
        threadId: "thread-1",
        projectId: "project-1",
        threadTitle: "Improve Linux notifications",
        branch: "local/linux-notifications",
        assistantMessageId: "message-1",
      }),
    ]);
    expect(repeated.completions).toEqual([]);
  });

  it("does not notify for a different turn first seen completed after reconnect", () => {
    const running = observe(null, [thread("running", { runId: "run-1" })]);
    const completed = observe(running.nextState, [thread("completed", { runId: "run-2" })]);

    expect(completed.completions).toEqual([]);
  });

  it("does not notify for errors, interruptions, or archived threads", () => {
    const running = observe(null, [
      thread("running", { threadId: "error" }),
      thread("running", { threadId: "interrupted" }),
      thread("running", { threadId: "archived" }),
    ]);
    const settled = observe(running.nextState, [
      thread("failed", { threadId: "error" }),
      thread("interrupted", { threadId: "interrupted" }),
      thread("completed", { threadId: "archived", archived: true }),
    ]);

    expect(settled.completions).toEqual([]);
  });

  it("compacts and truncates final response previews", () => {
    expect(compactFinalResponsePreview("  Done.\n\nAll tests pass.  ")).toBe(
      "Done. All tests pass.",
    );
    expect(compactFinalResponsePreview("123456789", 6)).toBe("12345…");
    expect(compactFinalResponsePreview(" \n ")).toBeNull();
  });

  it("formats useful notification metadata", () => {
    const completion = observe(null, [thread("running")]);
    const [finished] = observe(completion.nextState, [thread("completed")]).completions;
    expect(finished).toBeDefined();

    expect(
      buildLinuxCompletionNotification({
        completion: finished!,
        assistantPreview: "Implemented the notification preview.",
        projectTitle: "t3code",
        environmentLabel: "Local",
      }),
    ).toEqual({
      title: "Improve Linux notifications",
      body: "Implemented the notification preview.\nt3code · local/linux-notifications · 59m 59s · Local",
    });
    expect(formatTurnDuration("2026-08-18T11:59:58.500Z", "2026-08-18T12:00:00.000Z")).toBe("2s");
  });
});
