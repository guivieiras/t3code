import { CodexSettings, ProviderDriverKind } from "@t3tools/contracts";
import { modelBrandIcon } from "@t3tools/client-runtime/model-brand-icons";
import { providerClients } from "@t3tools/client-runtime/provider-clients";
import type { ProviderClientDefinition } from "@t3tools/provider-core/client";
import {
  isOpenRouterCodexConnection,
  OPENROUTER_API_KEY_ENV,
} from "@t3tools/shared/codexConnection";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export { providerClients };

const CODEX_DRIVER_KIND = ProviderDriverKind.make("codex");

/** A Codex instance whose `connection` routes turns through OpenRouter; Codex settings otherwise. */
export const OPENROUTER_CODEX_CLIENT: ProviderClientDefinition = {
  driverKind: CODEX_DRIVER_KIND,
  label: "OpenRouter via Codex",
  icon: modelBrandIcon("openrouter"),
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
    },
  ],
  hasDefaultInstance: false,
};

const decodeCodexSettings = Schema.decodeUnknownOption(CodexSettings);

/** The client definition for a configured instance, so OpenRouter instances get their own form. */
export function providerClientForInstance(
  driver: ProviderDriverKind,
  config: unknown,
): ProviderClientDefinition | undefined {
  if (driver === CODEX_DRIVER_KIND) {
    const decoded = decodeCodexSettings(config ?? {});
    if (Option.isSome(decoded) && isOpenRouterCodexConnection(decoded.value)) {
      return OPENROUTER_CODEX_CLIENT;
    }
  }
  return providerClients.get(driver);
}
