import { describe, expect, it } from "vite-plus/test";

import {
  buildFreshContextPlanImplementationPrompt,
  resolvePlanFollowUpSubmission,
} from "./proposedPlan";

describe("resolvePlanFollowUpSubmission", () => {
  it.each(["", "Consider this "])(
    "keeps context-bearing feedback in plan mode with prose %j",
    (prose) => {
      const draftText = `${prose}[PR #42](t3-context://v1/review-comment/pr-42)`;
      expect(resolvePlanFollowUpSubmission({ draftText })).toEqual({
        text: draftText,
        interactionMode: "plan",
      });
    },
  );
  it("switches to default mode when implementing the ready plan without extra text", () => {
    expect(resolvePlanFollowUpSubmission({ draftText: "   " })).toEqual({
      text: "Implement the plan.",
      interactionMode: "default",
    });
  });
});

describe("buildFreshContextPlanImplementationPrompt", () => {
  it("carries the plan with Codex's fresh-context handoff", () => {
    expect(buildFreshContextPlanImplementationPrompt("## Ship it\n\n- step 1\n")).toBe(
      "A previous agent produced the plan below to accomplish the user's task. " +
        "Implement the plan in a fresh context. Treat the plan as the source of user intent, " +
        "re-read files as needed, and carry the work through implementation and verification.\n\n" +
        "## Ship it\n\n- step 1",
    );
  });
});
