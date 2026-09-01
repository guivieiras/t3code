import type { CodexSettings, ProviderInstanceId } from "@t3tools/contracts";

import { tokenizeCliArgs } from "./cliArgs.ts";

export const OPENROUTER_API_KEY_ENV = "OPENROUTER_API_KEY";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const OPENROUTER_CODEX_OVERRIDES = [
  ["model_provider", "openrouter"],
  ["model_providers.openrouter.name", "OpenRouter"],
  ["model_providers.openrouter.base_url", OPENROUTER_BASE_URL],
  ["model_providers.openrouter.env_key", OPENROUTER_API_KEY_ENV],
  ["model_providers.openrouter.wire_api", "responses"],
  ["model_providers.openrouter.requires_openai_auth", false],
] as const;

function stripTomlStringQuotes(value: string): string {
  const trimmed = value.trim();
  const first = trimmed[0];
  const last = trimmed.at(-1);
  return trimmed.length >= 2 && first === last && (first === '"' || first === "'")
    ? trimmed.slice(1, -1)
    : trimmed;
}

function configAssignment(token: string): readonly [string, string] | undefined {
  const separatorIndex = token.indexOf("=");
  if (separatorIndex <= 0) return undefined;
  const key = token.slice(0, separatorIndex).trim();
  if (key.length === 0) return undefined;
  return [key, stripTomlStringQuotes(token.slice(separatorIndex + 1))];
}

function readConfigOverrides(launchArgs: string): ReadonlyMap<string, string> {
  const tokens = tokenizeCliArgs(launchArgs);
  const overrides = new Map<string, string>();

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === undefined) continue;

    let assignment: readonly [string, string] | undefined;
    if (token === "-c" || token === "--config") {
      const value = tokens[index + 1];
      if (value !== undefined) {
        assignment = configAssignment(value);
        index++;
      }
    } else if (token.startsWith("-c=")) {
      assignment = configAssignment(token.slice(3));
    } else if (token.startsWith("--config=")) {
      assignment = configAssignment(token.slice("--config=".length));
    }

    if (assignment) overrides.set(assignment[0], assignment[1]);
  }

  return overrides;
}

export function isOpenRouterCodexConnection(
  settings: Pick<CodexSettings, "connection" | "launchArgs">,
): boolean {
  if (settings.connection === "openrouter") return true;
  return readConfigOverrides(settings.launchArgs).get("model_provider") === "openrouter";
}

function openRouterLaunchArgs(launchArgs: string): string {
  const existing = readConfigOverrides(launchArgs);
  const additions: string[] = [];

  for (const [key, value] of OPENROUTER_CODEX_OVERRIDES) {
    const serialized = typeof value === "boolean" ? String(value) : JSON.stringify(value);
    if (existing.get(key) === stripTomlStringQuotes(serialized)) continue;
    additions.push(`-c '${key}=${serialized}'`);
  }

  return [launchArgs.trim(), ...additions].filter((value) => value.length > 0).join(" ");
}

export function resolveCodexConnectionSettings(
  settings: CodexSettings,
  instanceId: ProviderInstanceId,
): CodexSettings {
  if (!isOpenRouterCodexConnection(settings)) return settings;

  return {
    ...settings,
    connection: "openrouter",
    shadowHomePath:
      settings.shadowHomePath.trim() || `~/.codex-t3/${String(instanceId).toLowerCase()}`,
    launchArgs: openRouterLaunchArgs(settings.launchArgs),
  };
}
