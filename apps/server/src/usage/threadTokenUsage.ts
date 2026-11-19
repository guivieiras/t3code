import type { ProviderSessionModelUsage, TurnTokenUsage } from "@t3tools/contracts";

import type {
  ThreadTokenUsageSource,
  ThreadTokenUsageTurn,
} from "../orchestration-v2/ProjectionStore.ts";
import type { ModelTokenRow } from "./usagePricing.ts";

type Snapshot = ReadonlyArray<ProviderSessionModelUsage>;

const COUNTERS = ["inputTokens", "cacheReadTokens", "cacheWriteTokens", "outputTokens"] as const;

export interface ThreadTokenUsageRows {
  readonly turns: number;
  /** Main-agent reasoning, which session totals do not report. */
  readonly reasoningTokens: number;
  /** Some work is missing: turns that reported only part of their usage and no later total covers. */
  readonly partial: boolean;
  readonly rows: ReadonlyArray<ModelTokenRow>;
}

/** A session total only grows; a counter going down means `/clear` or a session that lost them. */
function wentBackwards(previous: Snapshot, next: Snapshot): boolean {
  const byModel = new Map(next.map((entry) => [entry.model, entry]));
  return previous.some((before) => {
    const after = byModel.get(before.model);
    return after === undefined || COUNTERS.some((counter) => after[counter] < before[counter]);
  });
}

function containsBaseline(snapshot: Snapshot, baseline: Snapshot): boolean {
  return !wentBackwards(baseline, snapshot);
}

function rowsFromSnapshot(snapshot: Snapshot, baseline: Snapshot | null): ModelTokenRow[] {
  const before = new Map((baseline ?? []).map((entry) => [entry.model, entry]));
  return snapshot.map((entry) => {
    const base = before.get(entry.model);
    const costUsd =
      entry.costUsd === undefined
        ? undefined
        : base === undefined
          ? entry.costUsd
          : base.costUsd === undefined
            ? undefined
            : entry.costUsd - base.costUsd;
    return {
      model: entry.model,
      inputTokens: entry.inputTokens - (base?.inputTokens ?? 0),
      cacheReadTokens: entry.cacheReadTokens - (base?.cacheReadTokens ?? 0),
      cacheWriteTokens: entry.cacheWriteTokens - (base?.cacheWriteTokens ?? 0),
      cacheWrite1hTokens: Math.max(
        0,
        (entry.cacheWrite1hTokens ?? 0) - (base?.cacheWrite1hTokens ?? 0),
      ),
      outputTokens: entry.outputTokens - (base?.outputTokens ?? 0),
      // Claude Code's own cost is priced per request, so it carries long-context and fast rates.
      ...(costUsd !== undefined && (entry.costBasis ?? "list") === "list"
        ? { providerCostUsd: Math.max(0, costUsd) }
        : {}),
    };
  });
}

function rowFromTurn(turn: ThreadTokenUsageTurn): ModelTokenRow {
  const usage: TurnTokenUsage = turn.usage;
  const cacheRead = usage.cachedInputTokens ?? 0;
  const cacheWrite = usage.cacheCreationTokens ?? 0;
  return {
    model: turn.model,
    // Turn input counts include cache reads and writes.
    inputTokens: Math.max(0, (usage.inputTokens ?? 0) - cacheRead - cacheWrite),
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    cacheWrite1hTokens: turn.oneHourCache ? cacheWrite : 0,
    outputTokens: usage.outputTokens ?? 0,
  };
}

/**
 * A session that reports running totals is counted from them: the last total of each stretch
 * between resets, which covers subagents, compaction, and interrupted turns. A natively forked
 * session starts from its parent's totals, so those come off its first stretch. Sessions without
 * totals, and turns after a session's last total, fall back to each turn's own usage.
 */
export function threadTokenUsageRows(source: ThreadTokenUsageSource): ThreadTokenUsageRows {
  const sessions = new Map<string, ThreadTokenUsageTurn[]>();
  for (const turn of source.turns) {
    const session = sessions.get(turn.providerThreadId);
    if (session === undefined) sessions.set(turn.providerThreadId, [turn]);
    else session.push(turn);
  }
  const ordered = [...sessions.values()]
    .map((turns) => turns.toSorted((left, right) => left.ordinal - right.ordinal))
    .toSorted(
      (left, right) =>
        left[0]!.providerThreadFirstRunOrdinal - right[0]!.providerThreadFirstRunOrdinal,
    );

  const rows: ModelTokenRow[] = [];
  let reasoningTokens = 0;
  let partial = false;
  ordered.forEach((turns, sessionIndex) => {
    for (const turn of turns) reasoningTokens += turn.usage.reasoningTokens ?? 0;
    let lastSnapshotOrdinal = Number.NEGATIVE_INFINITY;
    let first: Snapshot | null = null;
    let last: Snapshot | null = null;
    let stretch = 0;
    const closeStretch = () => {
      if (first === null || last === null) return;
      const baseline =
        sessionIndex === 0 && stretch === 0 && source.forkBaseline !== null
          ? source.forkBaseline
          : null;
      rows.push(
        ...rowsFromSnapshot(
          last,
          baseline !== null && containsBaseline(first, baseline) ? baseline : null,
        ),
      );
      stretch += 1;
    };
    for (const turn of turns) {
      const snapshot = turn.usage.sessionModelUsage;
      if (snapshot === undefined || snapshot.length === 0) continue;
      if (last !== null && wentBackwards(last, snapshot)) {
        closeStretch();
        first = null;
      }
      first ??= snapshot;
      last = snapshot;
      lastSnapshotOrdinal = turn.ordinal;
    }
    closeStretch();
    for (const turn of turns) {
      if (turn.ordinal <= lastSnapshotOrdinal || turn.usage.localCommand === true) continue;
      if (turn.usage.usageStatus !== "complete") partial = true;
      rows.push(rowFromTurn(turn));
    }
  });
  return { turns: source.turns.length, reasoningTokens, partial, rows };
}
