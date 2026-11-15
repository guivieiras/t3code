import { CodexSettings, ProviderInstanceId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { tokenizeCliArgs } from "./cliArgs.ts";
import {
  isOpenRouterCodexConnection,
  resolveCodexConnectionSettings,
  withCodexConnectionLaunchArgs,
} from "./codexConnection.ts";

const decodeCodexSettings = Schema.decodeSync(CodexSettings);
const instanceId = ProviderInstanceId.make("Openrouter_Work");

describe("Codex connection settings", () => {
  it("leaves native Codex settings and launch arguments unchanged", () => {
    const settings = decodeCodexSettings({ binaryPath: "/opt/codex", launchArgs: "--yolo" });

    expect(resolveCodexConnectionSettings(settings, instanceId)).toBe(settings);
    expect(isOpenRouterCodexConnection(settings)).toBe(false);
    expect(withCodexConnectionLaunchArgs("--yolo", settings)).toBe("--yolo");
  });

  it("gives an OpenRouter instance its own shadow home and the provider overrides", () => {
    const settings = resolveCodexConnectionSettings(
      decodeCodexSettings({ connection: "openrouter" }),
      instanceId,
    );

    expect(settings.shadowHomePath).toBe("~/.codex-t3/openrouter_work");
    expect(tokenizeCliArgs(withCodexConnectionLaunchArgs("", settings))).toEqual([
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
    const legacy = decodeCodexSettings({ launchArgs: "-c 'model_provider=\"openrouter\"'" });
    const settings = resolveCodexConnectionSettings(legacy, ProviderInstanceId.make("openrouter"));
    const launchArgs = withCodexConnectionLaunchArgs(settings.launchArgs, settings);

    expect(settings.connection).toBe("openrouter");
    expect(launchArgs.match(/model_provider=/g)).toHaveLength(1);
    expect(launchArgs).toContain("model_providers.openrouter.base_url");
  });

  it("keeps user flags and lets the connection win over conflicting overrides", () => {
    const settings = decodeCodexSettings({ connection: "openrouter" });
    const launchArgs = withCodexConnectionLaunchArgs(
      "--strict-config -c 'model_providers.openrouter.base_url=\"https://example.com/v1\"'",
      settings,
    );

    expect(launchArgs).toContain("--strict-config");
    expect(launchArgs.endsWith("'model_providers.openrouter.requires_openai_auth=false'")).toBe(
      true,
    );
    expect(launchArgs.lastIndexOf("openrouter.ai")).toBeGreaterThan(
      launchArgs.indexOf("example.com"),
    );
  });

  it("never routes managed Codex through OpenRouter", () => {
    const managed = decodeCodexSettings({ setupMode: "managed", connection: "openrouter" });

    expect(isOpenRouterCodexConnection(managed)).toBe(false);
    expect(resolveCodexConnectionSettings(managed, instanceId)).toBe(managed);
    expect(withCodexConnectionLaunchArgs("--managed", managed)).toBe("--managed");
  });
});
