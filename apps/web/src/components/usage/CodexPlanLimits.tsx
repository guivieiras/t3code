import type {
  ServerProvider,
  ServerProviderRateLimitBucket,
  ServerProviderRateLimitWindow,
} from "@t3tools/contracts";

import { cn } from "../../lib/utils";
import type { EnvironmentUsageStatus } from "../../state/usage";

interface CodexPlanLimitsProps {
  readonly environments: readonly EnvironmentUsageStatus[];
  readonly timeZone: string;
}

interface CodexLimitEntry {
  readonly environmentLabel: string;
  readonly provider: ServerProvider;
}

export function remainingRateLimitPercent(usedPercent: number): number {
  return Math.max(0, Math.min(100, 100 - usedPercent));
}

export function formatRateLimitWindowLabel(windowDurationMins: number | null): string {
  if (windowDurationMins === null) return "Usage window";
  if (windowDurationMins % 10_080 === 0) {
    const weeks = windowDurationMins / 10_080;
    return weeks === 1 ? "7-day window" : `${weeks}-week window`;
  }
  if (windowDurationMins % 1_440 === 0) {
    const days = windowDurationMins / 1_440;
    return `${days}-day window`;
  }
  if (windowDurationMins % 60 === 0) {
    const hours = windowDurationMins / 60;
    return `${hours}-hour window`;
  }
  return `${windowDurationMins}-minute window`;
}

function collectCodexLimitEntries(
  environments: readonly EnvironmentUsageStatus[],
): readonly CodexLimitEntry[] {
  return environments.flatMap((environment) =>
    environment.providers
      .filter(
        (provider) =>
          provider.driver === "codex" &&
          provider.enabled &&
          provider.installed &&
          provider.auth.type === "chatgpt",
      )
      .map((provider) => ({ environmentLabel: environment.label, provider })),
  );
}

function formatResetTime(resetsAt: number | null, timeZone: string): string | null {
  if (resetsAt === null) return null;
  const instant = new Date(resetsAt * 1_000);
  if (Number.isNaN(instant.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}

function formatReadTime(readAt: string, timeZone: string): string {
  const instant = new Date(readAt);
  if (Number.isNaN(instant.getTime())) return "recently";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}

function planLabel(provider: ServerProvider): string {
  if (provider.auth.label) return provider.auth.label.replace(/ Subscription$/u, "");
  const planType = provider.accountRateLimits?.buckets.find(
    (bucket) => bucket.planType !== null,
  )?.planType;
  if (!planType) return "ChatGPT plan";
  return `ChatGPT ${planType.replaceAll("_", " ")}`;
}

function bucketLabel(bucket: ServerProviderRateLimitBucket): string {
  if (bucket.name) return bucket.name;
  if (bucket.id === "codex") return "Shared Codex";
  return bucket.id.replaceAll("_", " ");
}

function remainingBarClass(remainingPercent: number): string {
  if (remainingPercent <= 20) return "bg-destructive";
  if (remainingPercent <= 50) return "bg-amber-500 dark:bg-amber-400";
  return "bg-emerald-600 dark:bg-emerald-400";
}

function RateLimitWindow({
  window,
  timeZone,
}: {
  readonly window: ServerProviderRateLimitWindow;
  readonly timeZone: string;
}) {
  const remainingPercent = remainingRateLimitPercent(window.usedPercent);
  const resetTime = formatResetTime(window.resetsAt, timeZone);
  const label = formatRateLimitWindowLabel(window.windowDurationMins);

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-md bg-muted/45 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-medium text-foreground tabular-nums">
          {remainingPercent}% <span className="font-normal text-muted-foreground">left</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} remaining`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={remainingPercent}
        className="h-1.5 overflow-hidden rounded-full bg-border"
      >
        <div
          className={cn("h-full rounded-full", remainingBarClass(remainingPercent))}
          style={{ width: `${remainingPercent}%` }}
        />
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums">
        {resetTime ? `Resets ${resetTime}` : "Reset time unavailable"}
      </span>
    </div>
  );
}

function RateLimitBucket({
  bucket,
  timeZone,
}: {
  readonly bucket: ServerProviderRateLimitBucket;
  readonly timeZone: string;
}) {
  const windows: ReadonlyArray<{
    readonly key: "primary" | "secondary";
    readonly window: ServerProviderRateLimitWindow;
  }> = [
    ...(bucket.primary ? [{ key: "primary" as const, window: bucket.primary }] : []),
    ...(bucket.secondary ? [{ key: "secondary" as const, window: bucket.secondary }] : []),
  ];

  return (
    <div className="flex flex-col gap-2.5 border-t border-border/70 pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-foreground">{bucketLabel(bucket)}</span>
        {bucket.rateLimitReachedType || bucket.spendControlReached ? (
          <span className="text-xs text-destructive">Limit reached</span>
        ) : null}
      </div>
      {windows.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {windows.map(({ key, window }) => (
            <RateLimitWindow key={key} window={window} timeZone={timeZone} />
          ))}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">No usage windows reported.</span>
      )}
      {bucket.individualLimit ? (
        <span className="text-xs text-muted-foreground">
          Monthly spend {bucket.individualLimit.used} of {bucket.individualLimit.limit}
          {` · ${bucket.individualLimit.remainingPercent}% left`}
        </span>
      ) : null}
      {bucket.credits?.hasCredits ? (
        <span className="text-xs text-muted-foreground">
          {bucket.credits.unlimited
            ? "Unlimited credits"
            : `Credits balance ${bucket.credits.balance ?? "available"}`}
        </span>
      ) : null}
    </div>
  );
}

export function CodexPlanLimits({ environments, timeZone }: CodexPlanLimitsProps) {
  const entries = collectCodexLimitEntries(environments);
  if (entries.length === 0) return null;
  const showEnvironmentLabel = entries.length > 1;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="codex-plan-limits-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 id="codex-plan-limits-heading" className="text-sm font-medium text-foreground">
            Codex plan limits
          </h2>
          <p className="text-xs text-muted-foreground">
            Current subscription quota reported by Codex. This is separate from token cost below.
          </p>
        </div>
      </div>
      <div className={cn("grid gap-3", entries.length > 1 && "lg:grid-cols-2")}>
        {entries.map(({ environmentLabel, provider }) => {
          const limits = provider.accountRateLimits;
          return (
            <article
              key={`${environmentLabel}:${provider.instanceId}`}
              className="flex flex-col gap-4 rounded-lg border border-border bg-card/35 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{planLabel(provider)}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {showEnvironmentLabel
                      ? `${environmentLabel} · ${provider.displayName ?? "Codex"}`
                      : (provider.displayName ?? "Codex")}
                  </span>
                </div>
                {limits && limits.resetCreditsAvailable > 0 ? (
                  <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                    {limits.resetCreditsAvailable} full reset
                    {limits.resetCreditsAvailable === 1 ? "" : "s"} available
                  </span>
                ) : null}
              </div>

              {limits ? (
                <div className="flex flex-col gap-3">
                  {limits.buckets.map((bucket) => (
                    <RateLimitBucket key={bucket.id} bucket={bucket} timeZone={timeZone} />
                  ))}
                  <span className="text-[11px] text-muted-foreground">
                    Updated {formatReadTime(limits.readAt, timeZone)}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Plan limits are unavailable. Refresh this page or update the Codex CLI.
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
