import type {
  OrchestrationV2ProviderTurn,
  OrchestrationV2ThreadTokenUsage,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

/** Changes when another provider turn finishes, which is when the thread's totals can change. */
export function threadTokenUsageRevision(
  turns: ReadonlyArray<Pick<OrchestrationV2ProviderTurn, "completedAt">>,
): number {
  let latest = 0;
  for (const { completedAt } of turns) {
    if (completedAt !== null) latest = Math.max(latest, DateTime.toEpochMillis(completedAt));
  }
  return latest;
}

export interface ThreadTokenUsageRow {
  readonly label: string;
  readonly tokens: number;
  /** Null when no model in the thread had a rate. */
  readonly costUsd: number | null;
  /** Already counted in another row, so it is not part of the total. */
  readonly subset?: boolean;
}

export function threadTokenUsageTotal(usage: OrchestrationV2ThreadTokenUsage): number {
  return usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens;
}

/** Null when no model in the thread had a rate. */
export function threadTokenUsageCost(usage: OrchestrationV2ThreadTokenUsage): number | null {
  const cost = usage.cost;
  return cost == null ? null : cost.input + cost.cacheRead + cost.cacheWrite + cost.output;
}

/** One row per token type; cache writes and reasoning appear only for providers that report them. */
export function threadTokenUsageRows(
  usage: OrchestrationV2ThreadTokenUsage,
): ReadonlyArray<ThreadTokenUsageRow> {
  const cost = usage.cost ?? null;
  return [
    { label: "Input", tokens: usage.inputTokens, costUsd: cost?.input ?? null },
    { label: "Cache read", tokens: usage.cacheReadTokens, costUsd: cost?.cacheRead ?? null },
    ...(usage.cacheWriteTokens > 0
      ? [
          {
            label: "Cache write",
            tokens: usage.cacheWriteTokens,
            costUsd: cost?.cacheWrite ?? null,
          },
        ]
      : []),
    { label: "Output", tokens: usage.outputTokens, costUsd: cost?.output ?? null },
    ...(usage.reasoningTokens > 0
      ? [{ label: "Reasoning", tokens: usage.reasoningTokens, costUsd: null, subset: true }]
      : []),
  ];
}
