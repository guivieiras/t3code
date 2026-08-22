import { describe, expect, it } from "vite-plus/test";

import { formatRateLimitWindowLabel, remainingRateLimitPercent } from "./CodexPlanLimits";

describe("Codex plan limit formatting", () => {
  it("labels quota windows from their reported duration", () => {
    expect(formatRateLimitWindowLabel(300)).toBe("5-hour window");
    expect(formatRateLimitWindowLabel(10_080)).toBe("7-day window");
    expect(formatRateLimitWindowLabel(2_880)).toBe("2-day window");
    expect(formatRateLimitWindowLabel(null)).toBe("Usage window");
  });

  it("converts used percentage to bounded remaining percentage", () => {
    expect(remainingRateLimitPercent(43)).toBe(57);
    expect(remainingRateLimitPercent(-4)).toBe(100);
    expect(remainingRateLimitPercent(140)).toBe(0);
  });
});
