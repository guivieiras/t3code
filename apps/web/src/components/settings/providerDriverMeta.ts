import {
  AcpRegistrySettings,
  ClaudeSettings,
  CodexSettings,
  CursorSettings,
  GrokSettings,
  OpenCodeSettings,
  ProviderDriverKind,
} from "@t3tools/contracts";
import {
  isOpenRouterCodexConnection,
  OPENROUTER_API_KEY_ENV,
} from "@t3tools/shared/codexConnection";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  ACPRegistryIcon,
  ClaudeAI,
  CursorIcon,
  GrokIcon,
  type Icon,
  OpenAI,
  OpenCodeIcon,
} from "../Icons";
import { OpenRouterIcon } from "../chat/ProviderBrandIcons";

type ProviderSettingsSchema = {
  readonly fields: Readonly<Record<string, Schema.Top>>;
} & Schema.Top;

/**
 * Browser-safe provider definition. This is deliberately shaped like the
 * future provider package client export: the core web app gets a schema with
 * field annotations plus provider-level presentation metadata, then renders
 * settings generically.
 */
export interface ProviderClientDefinition {
  /** Stable picker identity. Multiple definitions may share one driver. */
  readonly id: string;
  readonly value: ProviderDriverKind;
  readonly label: string;
  readonly icon: Icon;
  readonly settingsSchema: ProviderSettingsSchema;
  readonly environmentFields?: readonly ProviderEnvironmentFieldDefinition[];
  readonly instanceIdPrefix?: string;
  readonly defaultDisplayName?: string;
  readonly defaultIconKey?: string;
  readonly defaultConfig?: Readonly<Record<string, unknown>>;
  /** Whether this driver has a built-in default instance backed by legacy settings. */
  readonly hasDefaultInstance?: boolean;
  /**
   * Optional short label rendered as a `variant="warning"` badge next to
   * the instance title. Used to flag drivers that still ship under an
   * early-access or preview gate — the flag is a property of the driver
   * kind (not a specific instance), so every instance of that driver —
   * built-in default or custom — advertises the same marker.
   */
  readonly badgeLabel?: string;
}

export interface ProviderEnvironmentFieldDefinition {
  readonly name: string;
  readonly label: string;
  readonly description?: string;
  readonly placeholder?: string;
  readonly sensitive?: boolean;
  readonly required?: boolean;
}

export const PROVIDER_CLIENT_DEFINITIONS: readonly ProviderClientDefinition[] = [
  {
    id: "codex",
    value: ProviderDriverKind.make("codex"),
    label: "Codex",
    icon: OpenAI,
    settingsSchema: CodexSettings,
  },
  {
    id: "claudeAgent",
    value: ProviderDriverKind.make("claudeAgent"),
    label: "Claude",
    icon: ClaudeAI,
    settingsSchema: ClaudeSettings,
  },
  {
    id: "cursor",
    value: ProviderDriverKind.make("cursor"),
    label: "Cursor",
    icon: CursorIcon,
    settingsSchema: CursorSettings,
    environmentFields: [
      {
        name: "CURSOR_API_KEY",
        label: "Cursor API key",
        description: "Required by the Cursor Agent SDK.",
        placeholder: "Paste API key",
        sensitive: true,
      },
    ],
  },
  {
    id: "grok",
    value: ProviderDriverKind.make("grok"),
    label: "Grok",
    icon: GrokIcon,
    settingsSchema: GrokSettings,
  },
  {
    id: "acpRegistry",
    value: ProviderDriverKind.make("acpRegistry"),
    label: "ACP Registry",
    icon: ACPRegistryIcon,
    badgeLabel: "V2 Preview",
    settingsSchema: AcpRegistrySettings,
    hasDefaultInstance: false,
  },
  {
    id: "opencode",
    value: ProviderDriverKind.make("opencode"),
    label: "OpenCode",
    icon: OpenCodeIcon,
    settingsSchema: OpenCodeSettings,
  },
];

const OPENROUTER_CODEX_DEFINITION: ProviderClientDefinition = {
  id: "openrouter-codex",
  value: ProviderDriverKind.make("codex"),
  label: "OpenRouter via Codex",
  icon: OpenRouterIcon,
  settingsSchema: Schema.Struct({
    binaryPath: CodexSettings.fields.binaryPath,
    homePath: CodexSettings.fields.homePath,
  }),
  environmentFields: [
    {
      name: OPENROUTER_API_KEY_ENV,
      label: "OpenRouter API key",
      description: "Used by Codex for turns and by T3 Code to load your model catalog.",
      placeholder: "sk-or-v1-...",
      sensitive: true,
      required: true,
    },
  ],
  instanceIdPrefix: "openrouter",
  defaultDisplayName: "OpenRouter",
  defaultIconKey: "openrouter",
  defaultConfig: { connection: "openrouter" },
  hasDefaultInstance: false,
};

export const PROVIDER_INSTANCE_OPTIONS: readonly ProviderClientDefinition[] =
  PROVIDER_CLIENT_DEFINITIONS.flatMap((definition) =>
    definition.id === "codex" ? [definition, OPENROUTER_CODEX_DEFINITION] : [definition],
  );

export const PROVIDER_INSTANCE_OPTION_BY_ID: Readonly<
  Record<string, ProviderClientDefinition | undefined>
> = Object.fromEntries(PROVIDER_INSTANCE_OPTIONS.map((definition) => [definition.id, definition]));

export const PROVIDER_CLIENT_DEFINITION_BY_VALUE: Partial<
  Record<ProviderDriverKind, ProviderClientDefinition>
> = Object.fromEntries(
  PROVIDER_CLIENT_DEFINITIONS.map((definition) => [definition.value, definition]),
);

export const DRIVER_OPTIONS = PROVIDER_CLIENT_DEFINITIONS;
export const DRIVER_OPTION_BY_VALUE = PROVIDER_CLIENT_DEFINITION_BY_VALUE;
export type DriverOption = ProviderClientDefinition;
const decodeCodexSettingsOption = Schema.decodeUnknownOption(CodexSettings);

/**
 * Look up the driver metadata for an instance's `driver` field. Accepts
 * Returns `undefined` for fork / unknown drivers so callers can decide how
 * to render them — typically by falling back to a generic card.
 */
export function getDriverOption(
  driver: ProviderDriverKind | undefined,
  config?: unknown,
): DriverOption | undefined {
  if (driver === undefined) return undefined;
  if (driver === ProviderDriverKind.make("codex")) {
    const decoded = decodeCodexSettingsOption(config);
    if (Option.isSome(decoded) && isOpenRouterCodexConnection(decoded.value)) {
      return OPENROUTER_CODEX_DEFINITION;
    }
  }
  return PROVIDER_CLIENT_DEFINITION_BY_VALUE[driver];
}
