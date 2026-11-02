import * as NodeAssert from "node:assert/strict";

import { describe, it } from "vite-plus/test";

import {
  codexAppServerArgs,
  codexExecLaunchArgs,
  resolveCodexLaunchArgs,
} from "./codexLaunchArgs.ts";

describe("resolveCodexLaunchArgs", () => {
  it("keeps an OpenRouter connection when the env override replaces launch arguments", () => {
    const resolved = resolveCodexLaunchArgs(
      { launchArgs: "--yolo", connection: "openrouter" },
      { T3CODE_CODEX_LAUNCH_ARGS: "--strict-config" },
    );
    NodeAssert.ok(resolved.startsWith("--strict-config "));
    NodeAssert.ok(!resolved.includes("--yolo"));
    NodeAssert.ok(resolved.includes(`'model_provider="openrouter"'`));
  });

  it("passes native launch arguments through untouched", () => {
    NodeAssert.equal(resolveCodexLaunchArgs({ launchArgs: " --yolo " }, {}), "--yolo");
  });
});

describe("codexAppServerArgs", () => {
  it("preserves escaped TOML quotes in config values", () => {
    NodeAssert.deepStrictEqual(
      codexAppServerArgs(String.raw`--config model=\"gpt-6.1-sol\" --strict-config`),
      ["app-server", "--config", 'model="gpt-6.1-sol"', "--strict-config"],
    );
  });
});

describe("codexExecLaunchArgs", () => {
  it("keeps shared codex flags and omits app-server-only flags", () => {
    NodeAssert.deepStrictEqual(
      codexExecLaunchArgs('--strict-config --enable foo --listen off --config model="gpt 5"'),
      ["--strict-config", "--enable", "foo", "--config", "model=gpt 5"],
    );
  });

  it("does not pair value-taking flags with adjacent flags", () => {
    NodeAssert.deepStrictEqual(codexExecLaunchArgs("--config --strict-config --enable --disable"), [
      "--strict-config",
    ]);
  });
});
