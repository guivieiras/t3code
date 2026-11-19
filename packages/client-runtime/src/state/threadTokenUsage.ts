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
  /** Already counted in another row, so it is not part of the total. */
  readonly subset?: boolean;
}

export function threadTokenUsageTotal(usage: OrchestrationV2ThreadTokenUsage): number {
  return usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens;
}

/** One row per token type; cache writes and reasoning appear only for providers that report them. */
export function threadTokenUsageRows(
  usage: OrchestrationV2ThreadTokenUsage,
): ReadonlyArray<ThreadTokenUsageRow> {
  return [
    { label: "Input", tokens: usage.inputTokens },
    { label: "Cache read", tokens: usage.cacheReadTokens },
    ...(usage.cacheWriteTokens > 0
      ? [{ label: "Cache write", tokens: usage.cacheWriteTokens }]
      : []),
    { label: "Output", tokens: usage.outputTokens },
    ...(usage.reasoningTokens > 0
      ? [{ label: "Reasoning", tokens: usage.reasoningTokens, subset: true }]
      : []),
  ];
}
