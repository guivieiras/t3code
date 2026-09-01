import { describe, expect, it } from "vite-plus/test";

import {
  buildCollapsedProposedPlanPreviewMarkdown,
  buildFreshContextPlanImplementationPrompt,
  buildPlanImplementationThreadTitle,
  buildPlanImplementationPrompt,
  buildProposedPlanMarkdownFilename,
  proposedPlanTitle,
  resolvePlanFollowUpSubmission,
  stripDisplayedPlanMarkdown,
} from "./proposedPlan";

describe("proposedPlanTitle", () => {
  it("reads the first markdown heading as the plan title", () => {
    expect(proposedPlanTitle("# Integrate RPC\n\nBody")).toBe("Integrate RPC");
  });

  it("returns null when the plan has no heading", () => {
    expect(proposedPlanTitle("- step 1")).toBeNull();
  });
});

describe("buildPlanImplementationPrompt", () => {
  it("matches the Codex same-context implementation prompt", () => {
    expect(buildPlanImplementationPrompt()).toBe("Implement the plan.");
  });
});

describe("buildFreshContextPlanImplementationPrompt", () => {
  it("matches the Codex fresh-context implementation handoff", () => {
    expect(buildFreshContextPlanImplementationPrompt("## Ship it\n\n- step 1\n")).toBe(
      "A previous agent produced the plan below to accomplish the user's task. " +
        "Implement the plan in a fresh context. Treat the plan as the source of user intent, " +
        "re-read files as needed, and carry the work through implementation and verification.\n\n" +
        "## Ship it\n\n- step 1",
    );
  });
});

describe("buildCollapsedProposedPlanPreviewMarkdown", () => {
  it("drops the redundant title heading and preserves the following markdown lines", () => {
    expect(
      buildCollapsedProposedPlanPreviewMarkdown(
        "# Integrate RPC\n\n## Summary\n\n- step 1\n- step 2",
        {
          maxLines: 4,
        },
      ),
    ).toBe("- step 1\n- step 2");
  });

  it("appends an overflow marker when the preview truncates remaining content", () => {
    expect(
      buildCollapsedProposedPlanPreviewMarkdown("# Integrate RPC\n\n- step 1\n- step 2\n- step 3", {
        maxLines: 2,
      }),
    ).toBe("- step 1\n- step 2\n\n...");
  });
});

describe("stripDisplayedPlanMarkdown", () => {
  it("drops the leading title heading from displayed plan markdown", () => {
    expect(stripDisplayedPlanMarkdown("# Integrate RPC\n\n## Summary\n\n- step 1\n")).toBe(
      "- step 1",
    );
  });

  it("preserves non-summary headings after dropping the title heading", () => {
    expect(stripDisplayedPlanMarkdown("# Integrate RPC\n\n## Scope\n\n- step 1\n")).toBe(
      "## Scope\n\n- step 1",
    );
  });
});

describe("resolvePlanFollowUpSubmission", () => {
  it("switches to default mode when implementing the ready plan without extra text", () => {
    expect(
      resolvePlanFollowUpSubmission({
        draftText: "   ",
      }),
    ).toEqual({
      text: "Implement the plan.",
      interactionMode: "default",
    });
  });

  it("stays in plan mode when the user adds a follow-up prompt", () => {
    expect(
      resolvePlanFollowUpSubmission({
        draftText: "Refine step 2 first",
      }),
    ).toEqual({
      text: "Refine step 2 first",
      interactionMode: "plan",
    });
  });
});

describe("buildPlanImplementationThreadTitle", () => {
  it("uses the plan heading when building the implementation thread title", () => {
    expect(buildPlanImplementationThreadTitle("# Integrate RPC\n\nBody")).toBe(
      "Implement Integrate RPC",
    );
  });

  it("falls back when the plan has no markdown heading", () => {
    expect(buildPlanImplementationThreadTitle("- step 1")).toBe("Implement plan");
  });
});

describe("buildProposedPlanMarkdownFilename", () => {
  it("derives a stable markdown filename from the plan heading", () => {
    expect(buildProposedPlanMarkdownFilename("# Integrate Effect RPC Into Server App")).toBe(
      "integrate-effect-rpc-into-server-app.md",
    );
  });

  it("falls back to a generic filename when the plan has no heading", () => {
    expect(buildProposedPlanMarkdownFilename("- step 1")).toBe("plan.md");
  });
});
