import {
  type ContextWindowSnapshot,
  deriveLatestContextWindowSnapshot,
  formatContextWindowCompactionMessage,
  latestProviderTurnTokenUsage,
} from "@t3tools/client-runtime/state/context-window";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { formatTokens } from "@t3tools/shared/usageFormat";
import { Pressable } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { withUniwind } from "uniwind";

import * as Dialog from "../../components/ui/Dialog";
import { useAndroidControlSizing } from "../../components/ui/useAndroidControlSizing";
import { useQuietThreadStructure } from "../../state/use-thread-detail";

const STROKE_WIDTH = 3;
const ThemedSvg = withUniwind(Svg);

function useContextWindowSnapshot(ref: ScopedThreadRef | null): ContextWindowSnapshot | null {
  const projection = useQuietThreadStructure(ref)?.projection;
  if (projection === undefined) return null;
  const providerThread = projection.providerThreads.find(
    (thread) => thread.id === projection.thread.activeProviderThreadId,
  );
  return deriveLatestContextWindowSnapshot(
    projection.visibleTurnItems,
    latestProviderTurnTokenUsage(projection.providerTurns, projection, providerThread),
    providerThread,
  );
}

function formatPercentage(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return value < 10 ? `${value.toFixed(1).replace(/\.0$/, "")}%` : `${Math.round(value)}%`;
}

function formatCost(cost: { readonly amount: number; readonly currency: string }): string {
  const fractionDigits = Math.abs(cost.amount) > 0 && Math.abs(cost.amount) < 0.01 ? 4 : 2;
  return `${cost.currency} ${cost.amount.toFixed(fractionDigits)}`;
}

function usageSummary(usage: ContextWindowSnapshot): string {
  const percentage = formatPercentage(usage.usedPercentage);
  const used = formatTokens(usage.usedTokens);
  return usage.maxTokens != null && percentage
    ? `${percentage} used · ${used} of ${formatTokens(usage.maxTokens)} tokens`
    : `${used} tokens used`;
}

function showDetails(usage: ContextWindowSnapshot) {
  const totalProcessed = usage.totalProcessedTokens ?? 0;
  const lines = [
    usageSummary(usage),
    totalProcessed > 0 ? `Total processed: ${formatTokens(totalProcessed)}` : null,
    usage.cost != null ? `Cost: ${formatCost(usage.cost)}` : null,
    usage.compactsAutomatically
      ? formatContextWindowCompactionMessage(usage.autoCompactThreshold)
      : null,
  ];
  Dialog.alert("Context window", lines.filter((line) => line !== null).join("\n"));
}

export function ComposerContextWindowMeter(props: {
  readonly threadRef: ScopedThreadRef | null;
  readonly size: "regular" | "large";
}) {
  const usage = useContextWindowSnapshot(props.threadRef);
  const { scale } = useAndroidControlSizing();
  if (usage === null) return null;

  const percentage = Math.max(0, Math.min(100, usage.usedPercentage ?? 0));
  const diameter = Math.round((props.size === "large" ? 24 : 20) * scale);
  const radius = (diameter - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <Pressable
      accessibilityLabel={`Context window: ${usageSummary(usage)}`}
      accessibilityRole="button"
      className="h-[44px] w-[32px] shrink-0 items-center justify-center active:opacity-70"
      hitSlop={{ top: 0, bottom: 0, left: 4, right: 4 }}
      onPress={() => showDetails(usage)}
    >
      <ThemedSvg
        width={diameter}
        height={diameter}
        colorClassName={percentage > 90 ? "accent-danger" : "accent-foreground-muted"}
        accessible={false}
        style={{ transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.24}
          strokeWidth={STROKE_WIDTH}
        />
        <Circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percentage / 100)}
        />
      </ThemedSvg>
    </Pressable>
  );
}
