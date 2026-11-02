import { WORKING_EXIT_GRACE_MS } from "@t3tools/client-runtime/state/thread-inbox";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  buildCompletionNotification,
  compactCompletionPreview,
  createThreadNotificationGate,
  formatRunDuration,
  type ThreadNotificationObservation,
} from "./ThreadNotificationCoordinator.logic";

const working: ThreadNotificationObservation = {
  attention: null,
  settled: false,
  completedAt: null,
};
const completed = (at: number): ThreadNotificationObservation => ({
  attention: null,
  settled: true,
  completedAt: at,
});
const visible = { archived: false, quiet: false };

function harness() {
  const notify = vi.fn();
  const gate = createThreadNotificationGate<string>(notify);
  let prior: ThreadNotificationObservation | undefined;
  const observe = (next: ThreadNotificationObservation, options = visible) => {
    gate.observe("thread", prior, next, options);
    prior = next;
  };
  return { gate, notify, observe };
}

describe("createThreadNotificationGate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops a completion when the thread resumes within the grace", () => {
    const { notify, observe } = harness();
    observe(working);
    observe(completed(1));
    vi.advanceTimersByTime(WORKING_EXIT_GRACE_MS - 1);
    observe(working);
    vi.advanceTimersByTime(WORKING_EXIT_GRACE_MS * 2);
    expect(notify).not.toHaveBeenCalled();
  });

  it("notifies a real completion once after the grace", () => {
    const { notify, observe } = harness();
    observe(working);
    observe(completed(1));
    vi.advanceTimersByTime(WORKING_EXIT_GRACE_MS - 1);
    expect(notify).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(notify.mock.calls).toEqual([["thread", "completion"]]);
    observe({ ...completed(1) });
    vi.advanceTimersByTime(WORKING_EXIT_GRACE_MS * 2);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("notifies attention at once and replaces a pending completion", () => {
    const { notify, observe } = harness();
    observe(working);
    observe(completed(1));
    vi.advanceTimersByTime(500);
    observe({ attention: "run-1:approval", settled: false, completedAt: null });
    expect(notify.mock.calls).toEqual([["thread", "input"]]);
    vi.advanceTimersByTime(60_000);
    // The request resolves and the same run reads as completed again.
    observe(completed(1));
    vi.advanceTimersByTime(WORKING_EXIT_GRACE_MS * 2);
    expect(notify.mock.calls).toEqual([["thread", "input"]]);
  });

  it("notifies one completion across continuation gaps", () => {
    const { notify, observe } = harness();
    observe(working);
    observe(completed(1));
    vi.advanceTimersByTime(300);
    observe(working);
    vi.advanceTimersByTime(5_000);
    observe(completed(2));
    vi.advanceTimersByTime(300);
    observe(working);
    vi.advanceTimersByTime(5_000);
    observe(completed(3));
    vi.advanceTimersByTime(WORKING_EXIT_GRACE_MS);
    expect(notify.mock.calls).toEqual([["thread", "completion"]]);
  });

  it("keeps a completion interrupted by attention after a working gap from firing", () => {
    const { notify, observe } = harness();
    observe(working);
    observe(completed(1));
    vi.advanceTimersByTime(500);
    observe(working);
    observe({ attention: "run-1:approval", settled: false, completedAt: null });
    vi.advanceTimersByTime(60_000);
    observe(completed(1));
    vi.advanceTimersByTime(WORKING_EXIT_GRACE_MS * 2);
    expect(notify.mock.calls).toEqual([["thread", "input"]]);
  });

  it("adds nothing when attention follows a completion that already fired", () => {
    const { notify, observe } = harness();
    observe(working);
    observe(completed(1));
    vi.advanceTimersByTime(WORKING_EXIT_GRACE_MS);
    observe({ attention: "run-1:limited", settled: false, completedAt: null });
    observe(completed(1));
    vi.advanceTimersByTime(WORKING_EXIT_GRACE_MS * 2);
    expect(notify.mock.calls).toEqual([
      ["thread", "completion"],
      ["thread", "input"],
    ]);
  });

  it("still notifies a newer completion after attention", () => {
    const { notify, observe } = harness();
    observe(working);
    observe(completed(1));
    vi.advanceTimersByTime(500);
    observe({ attention: "run-2:approval", settled: false, completedAt: null });
    observe(working);
    observe(completed(2));
    vi.advanceTimersByTime(WORKING_EXIT_GRACE_MS);
    expect(notify.mock.calls).toEqual([
      ["thread", "input"],
      ["thread", "completion"],
    ]);
  });

  it("ignores unrelated updates while a completion waits", () => {
    const { notify, observe } = harness();
    observe(working);
    observe(completed(1));
    vi.advanceTimersByTime(1_500);
    observe({ ...completed(1) });
    vi.advanceTimersByTime(500);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("notifies a run that settles again after a brief runtime blip", () => {
    const { notify, observe } = harness();
    observe(working);
    observe(completed(1));
    vi.advanceTimersByTime(500);
    observe(working);
    observe(completed(1));
    vi.advanceTimersByTime(WORKING_EXIT_GRACE_MS);
    expect(notify.mock.calls).toEqual([["thread", "completion"]]);
  });

  it("restarts the grace when a newer completion replaces a pending one", () => {
    const { notify, observe } = harness();
    observe(working);
    observe(completed(1));
    vi.advanceTimersByTime(1_500);
    observe(completed(2));
    vi.advanceTimersByTime(1_500);
    expect(notify).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("drops a pending completion on archive, stop request, removal or clear", () => {
    for (const end of [
      (h: ReturnType<typeof harness>) => h.observe(completed(1), { ...visible, archived: true }),
      (h: ReturnType<typeof harness>) =>
        h.observe({ ...completed(1) }, { ...visible, quiet: true }),
      (h: ReturnType<typeof harness>) => h.gate.retain(new Set()),
      (h: ReturnType<typeof harness>) => h.gate.clear(),
    ]) {
      const h = harness();
      h.observe(working);
      h.observe(completed(1));
      end(h);
      vi.advanceTimersByTime(WORKING_EXIT_GRACE_MS * 2);
      expect(h.notify).not.toHaveBeenCalled();
    }
  });

  it("never notifies a stopped run or the first observation", () => {
    const { notify, observe } = harness();
    observe(completed(1));
    observe(working);
    observe(completed(2), { ...visible, quiet: true });
    vi.advanceTimersByTime(WORKING_EXIT_GRACE_MS * 2);
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("completion notification content", () => {
  it("leads with the final reply, then where and how long it ran", () => {
    expect(
      buildCompletionNotification({
        threadTitle: "Improve notifications",
        finalReply: "  Done.\n\nAll tests pass.  ",
        projectTitle: "t3code",
        branch: "feat/notify",
        startedAt: "2026-08-18T11:00:01.000Z",
        completedAt: "2026-08-18T12:00:00.000Z",
        environmentLabel: "Laptop",
      }),
    ).toEqual({
      title: "Improve notifications",
      body: "Done. All tests pass.\nt3code · feat/notify · 59m 59s · Laptop",
    });
  });

  it("falls back when nothing but the title is known", () => {
    expect(
      buildCompletionNotification({
        threadTitle: "Untitled",
        finalReply: " \n ",
        projectTitle: null,
        branch: null,
        startedAt: null,
        completedAt: "2026-08-18T12:00:00.000Z",
        environmentLabel: null,
      }),
    ).toEqual({ title: "Untitled", body: "Thread completed" });
  });

  it("truncates long replies and formats short and long runs", () => {
    expect(compactCompletionPreview("123456789", 6)).toBe("12345…");
    expect(formatRunDuration("2026-08-18T11:59:59.500Z", "2026-08-18T12:00:00.000Z")).toBe("<1s");
    expect(formatRunDuration("2026-08-18T10:00:00.000Z", "2026-08-18T12:05:00.000Z")).toBe("2h 5m");
    expect(formatRunDuration("2026-08-18T12:00:01.000Z", "2026-08-18T12:00:00.000Z")).toBeNull();
  });
});
