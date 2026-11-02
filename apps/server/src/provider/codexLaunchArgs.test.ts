import * as NodeAssert from "node:assert/strict";

import { describe, it } from "vite-plus/test";

import {
  codexAppServerArgs,
  codexExecLaunchArgs,
  codexMcpListLaunchArgs,
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
  it.each([
    {
      name: "preserves escaped TOML quotes in config values",
      launchArgs: String.raw`--config model=\"gpt-6.1-sol\" --strict-config`,
      expected: ["--config", 'model="gpt-6.1-sol"', "--strict-config"],
    },
    {
      name: "lets launch args override the unload delay",
      launchArgs: "-c thread_unload_delay_secs=1800",
      expected: ["-c", "thread_unload_delay_secs=1800"],
    },
  ])("asks Codex to unload unsubscribed threads immediately and $name", (row) => {
    NodeAssert.deepStrictEqual(codexAppServerArgs(row.launchArgs), [
      "app-server",
      "-c",
      "thread_unload_delay_secs=0",
      ...row.expected,
    ]);
  });
});

describe("codexExecLaunchArgs", () => {
  it("keeps shared codex flags and omits app-server-only flags", () => {
    NodeAssert.deepStrictEqual(
      codexExecLaunchArgs('--strict-config --enable foo --listen off --config model="gpt 5"'),
      ["--strict-config", "--enable", "foo", "--config", "model=gpt 5"],
    );
  });

  it("drops launch args that enable user hooks", () => {
    NodeAssert.deepStrictEqual(
      codexExecLaunchArgs(
        "--enable hooks --enable=hooks --enable codex_hooks --enable=codex_hooks --enable foo --disable hooks",
      ),
      ["--enable", "foo", "--disable", "hooks"],
    );
  });

  it("does not pair value-taking flags with adjacent flags", () => {
    NodeAssert.deepStrictEqual(codexExecLaunchArgs("--config --strict-config --enable --disable"), [
      "--strict-config",
    ]);
  });
});

describe("codex exec and mcp list launch args", () => {
  const launchArgs =
    "--strict-config --oss --local-provider ollama --profile local -p=work --listen off --enable foo";

  it("keeps the local model provider flags for codex exec", () => {
    NodeAssert.deepStrictEqual(codexExecLaunchArgs(launchArgs), [
      "--strict-config",
      "--oss",
      "--local-provider",
      "ollama",
      "--profile",
      "local",
      "-p=work",
      "--enable",
      "foo",
    ]);
  });

  it("keeps the selected profile and drops exec-only flags for codex mcp list", () => {
    NodeAssert.deepStrictEqual(codexMcpListLaunchArgs(launchArgs), [
      "--profile",
      "local",
      "-p=work",
      "--enable",
      "foo",
    ]);
  });
});
