import { CodexSettings, ProviderInstanceId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { tokenizeCliArgs } from "./cliArgs.ts";
import { isOpenRouterCodexConnection, resolveCodexConnectionSettings } from "./codexConnection.ts";

const decodeCodexSettings = Schema.decodeSync(CodexSettings);
const instanceId = ProviderInstanceId.make("Openrouter_Work");

describe("Codex connection settings", () => {
  it("leaves native Codex settings unchanged", () => {
    const settings = decodeCodexSettings({ binaryPath: "/opt/codex" });

    expect(resolveCodexConnectionSettings(settings, instanceId)).toBe(settings);
    expect(isOpenRouterCodexConnection(settings)).toBe(false);
  });

  it("materializes the complete OpenRouter provider configuration", () => {
    const settings = resolveCodexConnectionSettings(
      decodeCodexSettings({ connection: "openrouter" }),
      instanceId,
    );

    expect(settings.shadowHomePath).toBe("~/.codex-t3/openrouter_work");
    expect(tokenizeCliArgs(settings.launchArgs)).toEqual([
      "-c",
      'model_provider="openrouter"',
      "-c",
      'model_providers.openrouter.name="OpenRouter"',
      "-c",
      'model_providers.openrouter.base_url="https://openrouter.ai/api/v1"',
      "-c",
      'model_providers.openrouter.env_key="OPENROUTER_API_KEY"',
      "-c",
      'model_providers.openrouter.wire_api="responses"',
      "-c",
      "model_providers.openrouter.requires_openai_auth=false",
    ]);
  });

  it("recognizes and completes the legacy launch-argument setup", () => {
    const settings = resolveCodexConnectionSettings(
      decodeCodexSettings({ launchArgs: "-c 'model_provider=\"openrouter\"'" }),
      ProviderInstanceId.make("openrouter"),
    );

    expect(settings.connection).toBe("openrouter");
    expect(settings.launchArgs.match(/model_provider=/g)).toHaveLength(1);
    expect(settings.launchArgs).toContain("model_providers.openrouter.base_url");
  });

  it("is idempotent and lets the supported connection override conflicting values", () => {
    const initial = decodeCodexSettings({
      connection: "openrouter",
      launchArgs:
        "--strict-config -c 'model_providers.openrouter.base_url=\"https://example.com/v1\"'",
    });
    const once = resolveCodexConnectionSettings(initial, instanceId);
    const twice = resolveCodexConnectionSettings(once, instanceId);

    expect(twice).toEqual(once);
    expect(once.launchArgs).toContain("--strict-config");
    expect(once.launchArgs).toContain('base_url="https://openrouter.ai/api/v1"');
  });
});
