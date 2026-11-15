import {
  type ContextWindowSnapshot,
  deriveLatestContextWindowSnapshot,
  formatContextWindowCompactionMessage,
  latestProviderTurnTokenUsage,
} from "@t3tools/client-runtime/state/context-window";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { formatTokens } from "@t3tools/shared/usageFormat";
import { Pressable, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { withUniwind } from "uniwind";

import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
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

function usedLabel(usage: ContextWindowSnapshot): string {
  const percentage = formatPercentage(usage.usedPercentage);
  const used = formatTokens(usage.usedTokens);
  return usage.maxTokens != null && percentage
    ? `${percentage} · ${used} / ${formatTokens(usage.maxTokens)}`
    : `${used} tokens`;
}

function usedPercentage(usage: ContextWindowSnapshot): number {
  return Math.max(0, Math.min(100, usage.usedPercentage ?? 0));
}

export function ComposerContextWindowMeter(props: {
  readonly threadRef: ScopedThreadRef | null;
  readonly size: "regular" | "large";
  readonly onPress: () => void;
}) {
  const usage = useContextWindowSnapshot(props.threadRef);
  const { scale } = useAndroidControlSizing();
  if (usage === null) return null;

  const percentage = usedPercentage(usage);
  const diameter = Math.round((props.size === "large" ? 24 : 20) * scale);
  const radius = (diameter - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <Pressable
      accessibilityLabel={`Context window, ${usedLabel(usage)} used`}
      accessibilityRole="button"
      className="h-[44px] w-[32px] shrink-0 items-center justify-center active:opacity-70"
      hitSlop={{ top: 0, bottom: 0, left: 4, right: 4 }}
      onPress={props.onPress}
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

function DetailRow(props: { readonly label: string; readonly value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="text-xs text-foreground-muted">{props.label}</Text>
      <Text className="font-t3-medium text-xs text-foreground-secondary tabular-nums">
        {props.value}
      </Text>
    </View>
  );
}

export function ComposerContextWindowPanel(props: {
  readonly threadRef: ScopedThreadRef | null;
  /** Absent when the provider cannot compact on request. */
  readonly onCompact: (() => void) | null;
  readonly compactDisabledReason: string | null;
  readonly onClose: () => void;
}) {
  const usage = useContextWindowSnapshot(props.threadRef);
  if (usage === null) return null;
  const percentage = usedPercentage(usage);
  const totalProcessed = usage.totalProcessedTokens ?? 0;

  return (
    <View className="gap-3 overflow-hidden rounded-[20px] border-continuous bg-card px-4 pt-3 pb-4">
      <View className="flex-row items-center gap-3">
        <Text className="min-w-0 flex-1 text-base text-foreground">Context window</Text>
        <Text className="text-xs text-foreground-muted tabular-nums">{usedLabel(usage)}</Text>
        <Pressable
          accessibilityLabel="Dismiss context window"
          accessibilityRole="button"
          hitSlop={12}
          onPress={props.onClose}
          className="-me-1 p-1 active:opacity-60"
        >
          <SymbolView
            name="xmark"
            size={14}
            tintColorClassName="accent-icon-muted"
            type="monochrome"
          />
        </Pressable>
      </View>
      {usage.maxTokens != null ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Context window usage"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(percentage) }}
          className="h-1.5 overflow-hidden rounded-full bg-foreground/12"
        >
          <View
            className={
              percentage > 90
                ? "h-full rounded-full bg-danger"
                : "h-full rounded-full bg-foreground-muted"
            }
            style={{ width: `${percentage}%` }}
          />
        </View>
      ) : null}
      {totalProcessed > 0 || usage.cost != null ? (
        <View className="gap-1.5">
          {totalProcessed > 0 ? (
            <DetailRow label="Total processed" value={formatTokens(totalProcessed)} />
          ) : null}
          {usage.cost != null ? <DetailRow label="Cost" value={formatCost(usage.cost)} /> : null}
        </View>
      ) : null}
      {usage.compactsAutomatically ? (
        <Text className="text-xs text-foreground-muted">
          {formatContextWindowCompactionMessage(usage.autoCompactThreshold)}
        </Text>
      ) : null}
      {props.onCompact ? (
        <View className="gap-1.5">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: props.compactDisabledReason !== null }}
            disabled={props.compactDisabledReason !== null}
            onPress={props.onCompact}
            className={
              props.compactDisabledReason !== null
                ? "min-h-11 flex-row items-center justify-center gap-2 rounded-full bg-foreground/8 opacity-50"
                : "min-h-11 flex-row items-center justify-center gap-2 rounded-full bg-foreground/8 active:opacity-70"
            }
          >
            <SymbolView
              name="arrow.down.right.and.arrow.up.left"
              size={16}
              tintColorClassName="accent-foreground"
              type="monochrome"
            />
            <Text className="font-t3-medium text-sm text-foreground">Compact context</Text>
          </Pressable>
          {props.compactDisabledReason !== null ? (
            <Text className="text-center text-xs text-foreground-muted">
              {props.compactDisabledReason}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
