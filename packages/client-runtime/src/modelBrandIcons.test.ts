import { describe, expect, it } from "vite-plus/test";

import { MODEL_BRAND_ICON_OPTIONS, resolveModelBrandIcon } from "./modelBrandIcons.ts";

describe("resolveModelBrandIcon", () => {
  it("resolves every pickable icon", () => {
    for (const option of MODEL_BRAND_ICON_OPTIONS) {
      expect(resolveModelBrandIcon(option.key)).toBe(option.icon);
    }
  });

  it("leaves missing and unknown keys to the driver icon", () => {
    expect(resolveModelBrandIcon(undefined)).toBeUndefined();
    expect(resolveModelBrandIcon("future-brand")).toBeUndefined();
    expect(resolveModelBrandIcon("constructor")).toBeUndefined();
  });
});
