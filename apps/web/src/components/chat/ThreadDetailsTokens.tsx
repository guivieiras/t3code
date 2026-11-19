import { useAtomValue } from "@effect/atom-react";
import {
  threadTokenUsageRows,
  threadTokenUsageTotal,
} from "@t3tools/client-runtime/state/thread-token-usage";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { ChevronDownIcon } from "lucide-react";

import { formatContextWindowTokens } from "../../lib/contextWindow";
import { orchestrationEnvironment } from "../../state/orchestration";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { ThreadDetailsSection } from "./ThreadDetailsSection";

/** Tokens the thread's finished turns used, expandable into one row per token type. */
export function ThreadDetailsTokens({
  environmentId,
  threadId,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const result = useAtomValue(
    orchestrationEnvironment.threadTokenUsage({ environmentId, input: { threadId } }),
  );
  // Servers without this method fail the read; the row stays hidden there.
  const usage = AsyncResult.getOrElse(result, () => null);
  const total = usage === null ? 0 : threadTokenUsageTotal(usage);
  if (usage === null || total === 0) return null;

  return (
    <ThreadDetailsSection
      headingId="thread-details-tokens-heading"
      title="Token usage"
      showHeading={false}
    >
      <Collapsible>
        <CollapsibleTrigger
          aria-label={`Tokens: ${total.toLocaleString("en-US")} used`}
          className="group/tokens flex h-6 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-xs outline-none hover:bg-black/[0.035] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-panel-open:bg-black/[0.035] dark:hover:bg-white/[0.08] dark:data-panel-open:bg-white/[0.08]"
        >
          <span className="text-muted-foreground">Tokens</span>
          <span className="flex items-center gap-1 font-medium text-foreground/80 tabular-nums">
            {formatContextWindowTokens(total)}
            <ChevronDownIcon
              aria-hidden
              className="size-3 text-muted-foreground transition-transform group-data-panel-open/tokens:rotate-180 motion-reduce:transition-none"
            />
          </span>
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <dl className="text-xs text-muted-foreground">
            {threadTokenUsageRows(usage).map((row) => (
              <div
                key={row.label}
                className="flex h-6 items-center justify-between gap-3 ps-5 pe-9"
              >
                <dt className={row.subset ? "ps-2.5" : undefined}>
                  {row.subset ? `of which ${row.label.toLowerCase()}` : row.label}
                </dt>
                <dd className="tabular-nums">{formatContextWindowTokens(row.tokens)}</dd>
              </div>
            ))}
          </dl>
          <p className="px-5 pt-1 text-2xs text-muted-foreground/80">
            {usage.turns === 1 ? "1 turn" : `${usage.turns.toLocaleString("en-US")} turns`}
            {usage.partial ? " · some turns reported partial usage" : ""}
          </p>
        </CollapsiblePanel>
      </Collapsible>
    </ThreadDetailsSection>
  );
}
