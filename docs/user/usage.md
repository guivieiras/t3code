# Review usage

The Usage page combines Codex, Claude Code, and Grok Build activity from your connected
environments. It reads the providers' local session history and shows API-equivalent token cost,
processed tokens, cache savings, provider shares, and model breakdowns. Subscription billing is
separate from the raw token cost shown here.

Grok Build totals come from persisted session updates. Interactive turns that never wrote a
completed-turn record will not appear.

When Codex is connected through a ChatGPT subscription, the page also shows the current plan quota
for every configured Codex account. Each reported window includes its remaining percentage and reset
time. Model-specific limits stay separate from the shared Codex limit, and full-reset credits appear
when the account has them.

Use **Past 24h** for an hourly chart covering the exact rolling 24-hour period. The **7 days**,
**30 days**, and **90 days** ranges use daily resolution. Cost and token toggles update both the
headline and chart. Refreshing rescans every connected environment and refreshes its provider quota.
