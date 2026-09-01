export const MODEL_BRAND_ICON_KEYS = [
  "openrouter",
  "openai",
  "anthropic",
  "google",
  "xai",
  "meta",
  "mistral",
  "deepseek",
  "qwen",
] as const;

export type ModelBrandIconKey = (typeof MODEL_BRAND_ICON_KEYS)[number];

const PUBLISHER_ICON_KEYS: Readonly<Record<string, ModelBrandIconKey>> = {
  anthropic: "anthropic",
  deepseek: "deepseek",
  google: "google",
  meta: "meta",
  "meta-llama": "meta",
  mistral: "mistral",
  mistralai: "mistral",
  openai: "openai",
  openrouter: "openrouter",
  qwen: "qwen",
  qwenlm: "qwen",
  "x-ai": "xai",
  xai: "xai",
};

const MODEL_PREFIX_ICON_KEYS: ReadonlyArray<readonly [string, ModelBrandIconKey]> = [
  ["claude", "anthropic"],
  ["deepseek", "deepseek"],
  ["gemini", "google"],
  ["gpt", "openai"],
  ["chatgpt", "openai"],
  ["codex", "openai"],
  ["o1", "openai"],
  ["o3", "openai"],
  ["o4", "openai"],
  ["grok", "xai"],
  ["mistral", "mistral"],
  ["mixtral", "mistral"],
  ["codestral", "mistral"],
];

const MODEL_STEM_ICON_KEYS: ReadonlyArray<readonly [string, ModelBrandIconKey]> = [
  ["llama", "meta"],
  ["qwen", "qwen"],
];

/**
 * Resolve a bundled model-brand icon from common catalog slugs. The publisher
 * segment wins when present, while bare first-party slugs use conservative
 * model-family prefixes. Unknown publishers return undefined so callers can
 * fall back to the configured provider instance icon.
 */
export function resolveModelBrandIconKey(slug: string): ModelBrandIconKey | undefined {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return undefined;

  const slashIndex = normalized.indexOf("/");
  const publisher = slashIndex === -1 ? undefined : normalized.slice(0, slashIndex);
  if (publisher) {
    return PUBLISHER_ICON_KEYS[publisher];
  }

  for (const [prefix, iconKey] of MODEL_PREFIX_ICON_KEYS) {
    if (normalized === prefix || normalized.startsWith(`${prefix}-`)) {
      return iconKey;
    }
  }
  for (const [stem, iconKey] of MODEL_STEM_ICON_KEYS) {
    if (normalized.startsWith(stem)) {
      return iconKey;
    }
  }
  return undefined;
}
