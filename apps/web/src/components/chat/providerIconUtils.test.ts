import { ProviderDriverKind } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { OpenAI } from "../Icons";
import { OpenRouterIcon } from "./ProviderBrandIcons";
import { resolveProviderIcon } from "./providerIconUtils";

describe("resolveProviderIcon", () => {
  const codex = ProviderDriverKind.make("codex");

  it("uses the curated instance icon before the driver default", () => {
    expect(resolveProviderIcon({ driverKind: codex, iconKey: "openrouter" })).toBe(OpenRouterIcon);
  });

  it("falls back to the driver icon for missing or unknown icon keys", () => {
    expect(resolveProviderIcon({ driverKind: codex })).toBe(OpenAI);
    expect(resolveProviderIcon({ driverKind: codex, iconKey: "future-brand" })).toBe(OpenAI);
  });

  it("allows a curated icon for an unknown driver", () => {
    expect(
      resolveProviderIcon({
        driverKind: ProviderDriverKind.make("custom"),
        iconKey: "openrouter",
      }),
    ).toBe(OpenRouterIcon);
  });
});
