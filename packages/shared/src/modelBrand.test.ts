import { describe, expect, it } from "vite-plus/test";

import { resolveModelBrandIconKey } from "./modelBrand.js";

describe("resolveModelBrandIconKey", () => {
  it.each([
    ["openai/gpt-5.4", "openai"],
    ["anthropic/claude-sonnet-4", "anthropic"],
    ["google/gemini-2.5-pro", "google"],
    ["x-ai/grok-4", "xai"],
    ["meta-llama/llama-4-maverick", "meta"],
    ["mistralai/mistral-large", "mistral"],
    ["deepseek/deepseek-r1", "deepseek"],
    ["qwen/qwen3-coder", "qwen"],
  ] as const)("uses the publisher in %s", (slug, expected) => {
    expect(resolveModelBrandIconKey(slug)).toBe(expected);
  });

  it.each([
    ["gpt-5.4", "openai"],
    ["claude-opus-4", "anthropic"],
    ["gemini-2.5-pro", "google"],
    ["llama-4-scout", "meta"],
    ["llama3.3-70b", "meta"],
    ["codestral-latest", "mistral"],
    ["qwen3-coder", "qwen"],
  ] as const)("recognizes a bare model family in %s", (slug, expected) => {
    expect(resolveModelBrandIconKey(slug)).toBe(expected);
  });

  it("leaves unknown publishers to the provider instance fallback", () => {
    expect(resolveModelBrandIconKey("stealth/ox-alpha")).toBeUndefined();
    expect(resolveModelBrandIconKey("nousresearch/hermes-3")).toBeUndefined();
  });
});
