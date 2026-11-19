import type { ProviderSessionModelUsage, TurnTokenUsage } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { ThreadTokenUsageTurn } from "../orchestration-v2/ProjectionStore.ts";
import { threadTokenUsageRows } from "./threadTokenUsage.ts";

const totals = (
  model: string,
  input: number,
  extra: Partial<ProviderSessionModelUsage> = {},
): ProviderSessionModelUsage => ({
  model,
  inputTokens: input,
  cacheReadTokens: input * 10,
  cacheWriteTokens: input,
  outputTokens: input / 10,
  ...extra,
});

const turn = (
  session: string,
  ordinal: number,
  usage: Partial<TurnTokenUsage> & Pick<TurnTokenUsage, "usageStatus">,
  firstRun = session === "b" ? 10 : 1,
): ThreadTokenUsageTurn => ({
  providerThreadId: session,
  providerThreadFirstRunOrdinal: firstRun,
  ordinal,
  model: "claude-opus-5-5",
  oneHourCache: true,
  usage: { usageScope: "main_agent", hasSubagents: false, ...usage } as TurnTokenUsage,
});

describe("thread token usage rows", () => {
  it("counts a session from its last running total, across resumes and /clear resets", () => {
    const result = threadTokenUsageRows({
      forkBaseline: null,
      turns: [
        turn("a", 1, { usageStatus: "complete", sessionModelUsage: [totals("opus", 100)] }),
        // An interrupted turn reports nothing; the next total covers it.
        turn("a", 2, { usageStatus: "unavailable" }),
        // A resumed process carries the saved totals; compaction ran on another model.
        turn("a", 3, {
          usageStatus: "complete",
          localCommand: true,
          sessionModelUsage: [totals("opus", 300), totals("haiku", 50)],
        }),
        // /clear resets the running totals.
        turn("a", 4, { usageStatus: "complete", sessionModelUsage: [totals("opus", 20)] }),
      ],
    });
    expect(result.partial).toBe(false);
    expect(result.turns).toBe(4);
    expect(result.rows.map((row) => [row.model, row.inputTokens])).toEqual([
      ["opus", 300],
      ["haiku", 50],
      ["opus", 20],
    ]);
  });

  it("takes a native fork's inherited totals off its first stretch only when it carries them", () => {
    const forkBaseline = [totals("opus", 100, { costUsd: 1 })];
    const forked = threadTokenUsageRows({
      forkBaseline,
      turns: [
        turn("a", 1, {
          usageStatus: "complete",
          sessionModelUsage: [totals("opus", 130, { costUsd: 1.5 })],
        }),
      ],
    });
    expect(forked.rows).toEqual([
      expect.objectContaining({ model: "opus", inputTokens: 30, providerCostUsd: 0.5 }),
    ]);

    // A fork that started from zero did not inherit the parent's totals.
    const fresh = threadTokenUsageRows({
      forkBaseline,
      turns: [
        turn("a", 1, { usageStatus: "complete", sessionModelUsage: [totals("opus", 20)] }),
        turn("a", 2, { usageStatus: "complete", sessionModelUsage: [totals("opus", 150)] }),
      ],
    });
    expect(fresh.rows.map((row) => row.inputTokens)).toEqual([150]);
  });

  it("falls back to each turn's own usage where no running total covers it", () => {
    const result = threadTokenUsageRows({
      forkBaseline: null,
      turns: [
        turn("a", 1, { usageStatus: "complete", sessionModelUsage: [totals("opus", 100)] }),
        turn("a", 2, {
          usageStatus: "partial",
          inputTokens: 40,
          cachedInputTokens: 25,
          cacheCreationTokens: 5,
          outputTokens: 3,
          reasoningTokens: 2,
        }),
        // A session that never reported totals, such as Codex.
        turn("b", 1, { usageStatus: "complete", inputTokens: 7, outputTokens: 1 }),
        turn("b", 2, {
          usageStatus: "complete",
          inputTokens: 9,
          outputTokens: 1,
          localCommand: true,
        }),
      ],
    });
    expect(result.partial).toBe(true);
    expect(result.reasoningTokens).toBe(2);
    expect(result.rows.slice(1)).toEqual([
      {
        model: "claude-opus-5-5",
        inputTokens: 10,
        cacheReadTokens: 25,
        cacheWriteTokens: 5,
        cacheWrite1hTokens: 5,
        outputTokens: 3,
      },
      {
        model: "claude-opus-5-5",
        inputTokens: 7,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheWrite1hTokens: 0,
        outputTokens: 1,
      },
    ]);
  });
});
