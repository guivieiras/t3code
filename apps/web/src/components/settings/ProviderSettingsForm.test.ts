import { describe, expect, it } from "vite-plus/test";
import { ProviderDriverKind } from "@t3tools/contracts";

import {
  DRIVER_OPTION_BY_VALUE,
  getDriverOption,
  PROVIDER_INSTANCE_OPTION_BY_ID,
} from "./providerDriverMeta";
import {
  deriveProviderSettingsFields,
  nextProviderConfigWithFieldValue,
  readProviderConfigBoolean,
  readProviderConfigString,
} from "./ProviderSettingsForm";

describe("ProviderSettingsForm helpers", () => {
  it("derives visible provider config fields from the client definition schema", () => {
    const codex = DRIVER_OPTION_BY_VALUE[ProviderDriverKind.make("codex")];

    expect(codex).toBeDefined();
    expect(deriveProviderSettingsFields(codex!).map((field) => field.key)).toEqual([
      "binaryPath",
      "homePath",
      "shadowHomePath",
      "launchArgs",
    ]);
  });

  it("sources labels and descriptions from schema annotations", () => {
    const opencode = DRIVER_OPTION_BY_VALUE[ProviderDriverKind.make("opencode")];
    expect(opencode).toBeDefined();

    const serverPassword = deriveProviderSettingsFields(opencode!).find(
      (field) => field.key === "serverPassword",
    );

    expect(serverPassword).toMatchObject({
      label: "Server password",
      description: "Stored in plain text on disk.",
      control: "password",
    });
  });

  it("uses a dedicated environment field instead of legacy Cursor CLI settings", () => {
    const cursor = DRIVER_OPTION_BY_VALUE[ProviderDriverKind.make("cursor")];

    expect(cursor).toBeDefined();
    expect(deriveProviderSettingsFields(cursor!)).toEqual([]);
    expect(cursor?.environmentFields).toEqual([
      {
        name: "CURSOR_API_KEY",
        label: "Cursor API key",
        description: "Required by the Cursor Agent SDK.",
        placeholder: "Paste API key",
        sensitive: true,
      },
    ]);
  });

  it("exposes OpenRouter as a supported Codex connection", () => {
    const openrouter = PROVIDER_INSTANCE_OPTION_BY_ID["openrouter-codex"];

    expect(openrouter).toBeDefined();
    expect(openrouter?.value).toBe(ProviderDriverKind.make("codex"));
    expect(openrouter?.defaultConfig).toEqual({ connection: "openrouter" });
    expect(openrouter?.defaultDisplayName).toBe("OpenRouter");
    expect(openrouter?.defaultIconKey).toBe("openrouter");
    expect(openrouter?.environmentFields).toEqual([
      {
        name: "OPENROUTER_API_KEY",
        label: "OpenRouter API key",
        description: "Used by Codex for turns and by T3 Code to load your model catalog.",
        placeholder: "sk-or-v1-...",
        sensitive: true,
        required: true,
      },
    ]);
    expect(deriveProviderSettingsFields(openrouter!).map((field) => field.key)).toEqual([
      "binaryPath",
      "homePath",
    ]);
  });

  it("recognizes explicit and legacy OpenRouter Codex instances", () => {
    const codexDriver = ProviderDriverKind.make("codex");

    expect(getDriverOption(codexDriver, { connection: "openrouter" })?.id).toBe("openrouter-codex");
    expect(
      getDriverOption(codexDriver, {
        launchArgs: "-c 'model_provider=\"openrouter\"'",
      })?.id,
    ).toBe("openrouter-codex");
    expect(getDriverOption(codexDriver, {})?.id).toBe("codex");
  });

  it("exposes ACP Registry as an instance-only configurable driver", () => {
    const acpRegistry = DRIVER_OPTION_BY_VALUE[ProviderDriverKind.make("acpRegistry")];

    expect(acpRegistry).toBeDefined();
    expect(acpRegistry?.hasDefaultInstance).toBe(false);
    expect(deriveProviderSettingsFields(acpRegistry!).map((field) => field.key)).toEqual([
      "agentId",
      "commandPath",
      "authMethodId",
    ]);
  });

  it("shows the auto-compaction threshold for Claude providers", () => {
    const claude = DRIVER_OPTION_BY_VALUE[ProviderDriverKind.make("claudeAgent")];
    expect(claude).toBeDefined();

    expect(deriveProviderSettingsFields(claude!).map((field) => field.key)).toEqual([
      "binaryPath",
      "homePath",
      "autoCompactWindow",
      "launchArgs",
    ]);
  });

  it("preserves unknown config keys while omitting empty configurable fields", () => {
    const opencode = DRIVER_OPTION_BY_VALUE[ProviderDriverKind.make("opencode")];
    expect(opencode).toBeDefined();

    const serverUrl = deriveProviderSettingsFields(opencode!).find(
      (field) => field.key === "serverUrl",
    );
    expect(serverUrl).toBeDefined();

    const next = nextProviderConfigWithFieldValue(
      { forkOwned: 1, serverUrl: "http://127.0.0.1:4096" },
      serverUrl!,
      "",
    );

    expect(next).toEqual({ forkOwned: 1 });
  });

  it("reads non-string config values as blank strings", () => {
    expect(readProviderConfigString({ binaryPath: 123 }, "binaryPath")).toBe("");
  });

  it("omits false boolean fields when clearWhenEmpty is omit", () => {
    const next = nextProviderConfigWithFieldValue(
      { forkOwned: 1, experimental: true },
      {
        key: "experimental",
        control: "switch",
        label: "Experimental",
        clearWhenEmpty: "omit",
        defaultBooleanValue: false,
      },
      false,
    );

    expect(next).toEqual({ forkOwned: 1 });
  });

  it("omits true boolean fields when true is the default", () => {
    const next = nextProviderConfigWithFieldValue(
      { forkOwned: 1, experimental: false },
      {
        key: "experimental",
        control: "switch",
        label: "Experimental",
        clearWhenEmpty: "omit",
        defaultBooleanValue: true,
      },
      true,
    );

    expect(next).toEqual({ forkOwned: 1 });
  });

  it("stores false boolean fields when true is the default", () => {
    const next = nextProviderConfigWithFieldValue(
      undefined,
      {
        key: "experimental",
        control: "switch",
        label: "Experimental",
        clearWhenEmpty: "omit",
        defaultBooleanValue: true,
      },
      false,
    );

    expect(next).toEqual({ experimental: false });
  });

  it("preserves false boolean fields when clearWhenEmpty is persist", () => {
    const next = nextProviderConfigWithFieldValue(
      undefined,
      {
        key: "experimental",
        control: "switch",
        label: "Experimental",
        clearWhenEmpty: "persist",
      },
      false,
    );

    expect(next).toEqual({ experimental: false });
  });

  it("reads non-boolean config values as false booleans", () => {
    expect(readProviderConfigBoolean({ experimental: "true" }, "experimental")).toBe(false);
  });

  it("reads missing boolean config values from the supplied default", () => {
    expect(readProviderConfigBoolean({}, "experimental", true)).toBe(true);
  });
});
