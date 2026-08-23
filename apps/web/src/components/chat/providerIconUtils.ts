import { ProviderDriverKind } from "@t3tools/contracts";
import type { ModelBrandIconKey } from "@t3tools/shared/modelBrand";
import { ClaudeAI, CursorIcon, Gemini, GrokIcon, Icon, OpenAI, OpenCodeIcon } from "../Icons";
import { PROVIDER_OPTIONS } from "../../session-logic";
import {
  DeepSeekIcon,
  MetaIcon,
  MistralIcon,
  OpenRouterIcon,
  QwenIcon,
} from "./ProviderBrandIcons";

export const PROVIDER_ICON_BY_PROVIDER: Partial<Record<ProviderDriverKind, Icon>> = {
  [ProviderDriverKind.make("codex")]: OpenAI,
  [ProviderDriverKind.make("claudeAgent")]: ClaudeAI,
  [ProviderDriverKind.make("opencode")]: OpenCodeIcon,
  [ProviderDriverKind.make("cursor")]: CursorIcon,
  [ProviderDriverKind.make("grok")]: GrokIcon,
};

export const PROVIDER_ICON_BY_KEY: Readonly<Partial<Record<string, Icon>>> = {
  anthropic: ClaudeAI,
  deepseek: DeepSeekIcon,
  google: Gemini,
  meta: MetaIcon,
  mistral: MistralIcon,
  openai: OpenAI,
  openrouter: OpenRouterIcon,
  qwen: QwenIcon,
  xai: GrokIcon,
};

export const CURATED_PROVIDER_ICON_OPTIONS: ReadonlyArray<{
  readonly key: ModelBrandIconKey;
  readonly label: string;
}> = [
  { key: "openrouter", label: "OpenRouter" },
  { key: "openai", label: "OpenAI" },
  { key: "anthropic", label: "Anthropic" },
  { key: "google", label: "Google" },
  { key: "xai", label: "xAI" },
  { key: "meta", label: "Meta" },
  { key: "mistral", label: "Mistral" },
  { key: "deepseek", label: "DeepSeek" },
  { key: "qwen", label: "Qwen" },
];

export function resolveProviderIcon(input: {
  readonly driverKind: ProviderDriverKind;
  readonly iconKey?: string | undefined;
}): Icon | null {
  return (
    (input.iconKey ? PROVIDER_ICON_BY_KEY[input.iconKey] : undefined) ??
    PROVIDER_ICON_BY_PROVIDER[input.driverKind] ??
    null
  );
}

function isAvailableProviderOption(option: (typeof PROVIDER_OPTIONS)[number]): option is {
  value: ProviderDriverKind;
  label: string;
  available: true;
  pickerSidebarBadge?: "new" | "soon";
} {
  return option.available;
}

export const AVAILABLE_PROVIDER_OPTIONS = PROVIDER_OPTIONS.filter(isAvailableProviderOption);

export type ModelEsque = {
  slug: string;
  name: string;
  shortName?: string | undefined;
  subProvider?: string | undefined;
  isLegacy?: boolean | undefined;
  isUnavailable?: boolean | undefined;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLeadingQualifier(value: string, qualifier: string | null | undefined): string {
  const trimmedQualifier = qualifier?.trim();
  if (!trimmedQualifier) {
    return value;
  }

  const pattern = new RegExp(`^${escapeRegExp(trimmedQualifier)}(?:\\s*[.:/-]\\s*|\\s+)`, "iu");
  return value.replace(pattern, "").trim() || value;
}

export function getDisplayModelName(
  model: ModelEsque,
  options?: { preferShortName?: boolean },
): string {
  const name = options?.preferShortName && model.shortName ? model.shortName : model.name;
  return stripLeadingQualifier(name, model.subProvider);
}

export function getTriggerDisplayModelName(model: ModelEsque): string {
  return getDisplayModelName(model, { preferShortName: true });
}

export function getTriggerDisplayModelLabel(model: ModelEsque): string {
  return getTriggerDisplayModelName(model);
}
