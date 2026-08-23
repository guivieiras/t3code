#!/usr/bin/env node

import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models?supported_parameters=tools";
const DEFAULT_OPENROUTER_INSTANCE_ID = "Openrouter";
const INSTANCE_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const ALL_REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
const REASONING_EFFORT_RANK = new Map(
  ALL_REASONING_EFFORTS.map((effort, index) => [effort, index]),
);
const REASONING_EFFORT_LABELS = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
};

function usage() {
  return `Repair stale Codex capabilities in an OpenRouter provider cache.

Close T3 Code before running this script.

Usage:
  node scripts/repair-openrouter-provider-cache.mjs [options]

Options:
  --home-dir <path>    T3 home directory. Defaults to T3CODE_HOME or ~/.t3.
  --instance-id <id>   OpenRouter provider instance ID. Defaults to Openrouter.
  --dry-run            Report changes without writing or creating a backup.
  --help               Show this help.
`;
}

function requiredValue(args, index, option) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function parseArgs(args) {
  let homeDir = process.env.T3CODE_HOME?.trim() || NodePath.join(NodeOS.homedir(), ".t3");
  let instanceId = DEFAULT_OPENROUTER_INSTANCE_ID;
  let dryRun = false;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--help") {
      process.stdout.write(usage());
      process.exit(0);
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--home-dir") {
      homeDir = requiredValue(args, index, arg);
      index++;
      continue;
    }
    if (arg === "--instance-id") {
      instanceId = requiredValue(args, index, arg);
      index++;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  if (!INSTANCE_ID_PATTERN.test(instanceId)) {
    throw new Error(`Invalid provider instance ID: ${instanceId}`);
  }

  return { homeDir: NodePath.resolve(homeDir), instanceId, dryRun };
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new Error(`${label} is not valid JSON.`, { cause });
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function reasoningEfforts(reasoning) {
  const supported = reasoning.supported_efforts;
  const values =
    supported === null
      ? ALL_REASONING_EFFORTS
      : Array.isArray(supported)
        ? supported.filter((value) => typeof value === "string")
        : [];
  const unique = [...new Set(values)].filter(
    (effort) => effort !== "none" || reasoning.mandatory !== true,
  );
  return unique.toSorted(
    (left, right) =>
      (REASONING_EFFORT_RANK.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (REASONING_EFFORT_RANK.get(right) ?? Number.MAX_SAFE_INTEGER),
  );
}

function capabilitiesFromCatalogModel(model) {
  if (!isRecord(model.reasoning)) return null;

  const efforts = reasoningEfforts(model.reasoning);
  if (efforts.length === 0) return null;

  const defaultEffort =
    typeof model.reasoning.default_effort === "string" &&
    efforts.includes(model.reasoning.default_effort)
      ? model.reasoning.default_effort
      : undefined;
  const options = efforts.map((effort) => ({
    id: effort,
    label: REASONING_EFFORT_LABELS[effort] ?? effort,
    ...(effort === defaultEffort ? { isDefault: true } : {}),
  }));

  return {
    optionDescriptors: [
      {
        id: "reasoningEffort",
        label: "Reasoning",
        type: "select",
        options,
        ...(defaultEffort ? { currentValue: defaultEffort } : {}),
      },
    ],
  };
}

function repairSnapshot(snapshot, catalogModels, expectedInstanceId) {
  if (!isRecord(snapshot)) throw new Error("The provider cache must contain a JSON object.");
  if (snapshot.instanceId !== expectedInstanceId) {
    throw new Error(
      `Cache instance ID ${JSON.stringify(snapshot.instanceId)} does not match ${JSON.stringify(expectedInstanceId)}.`,
    );
  }
  if (snapshot.driver !== "codex") {
    throw new Error(
      `Expected a Codex-backed provider cache, found ${JSON.stringify(snapshot.driver)}.`,
    );
  }
  if (!Array.isArray(snapshot.models)) throw new Error("The provider cache has no model list.");

  const catalogById = new Map(
    catalogModels
      .filter((model) => isRecord(model) && typeof model.id === "string")
      .map((model) => [model.id, model]),
  );
  let matched = 0;
  let changed = 0;
  let reasoningModels = 0;

  const models = snapshot.models.map((model) => {
    if (!isRecord(model) || typeof model.slug !== "string") return model;
    const catalogModel = catalogById.get(model.slug);
    if (!catalogModel) return model;

    matched++;
    const capabilities = capabilitiesFromCatalogModel(catalogModel);
    if (capabilities) reasoningModels++;
    if (JSON.stringify(model.capabilities ?? null) === JSON.stringify(capabilities)) return model;

    changed++;
    return { ...model, capabilities };
  });

  return {
    snapshot: { ...snapshot, models },
    stats: {
      cached: snapshot.models.length,
      catalog: catalogById.size,
      matched,
      changed,
      reasoningModels,
    },
  };
}

async function fetchCatalog() {
  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`OpenRouter model catalog request failed with HTTP ${response.status}.`);
  }
  const payload = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error("OpenRouter returned an unexpected model catalog shape.");
  }
  return payload.data;
}

function backupSuffix() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

async function writeAtomically(path, contents, mode) {
  const temporaryPath = `${path}.repair-${process.pid}-${Date.now()}.tmp`;
  let handle;
  try {
    handle = await NodeFSP.open(temporaryPath, "wx", mode);
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await NodeFSP.rename(temporaryPath, path);
  } catch (cause) {
    await handle?.close().catch(() => undefined);
    await NodeFSP.unlink(temporaryPath).catch(() => undefined);
    throw cause;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cachePath = NodePath.join(options.homeDir, "caches", `${options.instanceId}.json`);
  const cacheStat = await NodeFSP.lstat(cachePath);
  if (!cacheStat.isFile() || cacheStat.isSymbolicLink()) {
    throw new Error(`Refusing to replace a non-regular cache file: ${cachePath}`);
  }

  const snapshot = parseJson(await NodeFSP.readFile(cachePath, "utf8"), cachePath);
  const catalogModels = await fetchCatalog();
  const repaired = repairSnapshot(snapshot, catalogModels, options.instanceId);

  process.stdout.write(
    [
      `Cache: ${cachePath}`,
      `Cached models: ${repaired.stats.cached}`,
      `OpenRouter tool-capable models: ${repaired.stats.catalog}`,
      `Matched models: ${repaired.stats.matched}`,
      `Models with reasoning controls: ${repaired.stats.reasoningModels}`,
      `Models changed: ${repaired.stats.changed}`,
    ].join("\n") + "\n",
  );

  if (options.dryRun) {
    process.stdout.write("Dry run complete. No files were changed.\n");
    return;
  }
  if (repaired.stats.changed === 0) {
    process.stdout.write("The cache already matches OpenRouter metadata.\n");
    return;
  }

  const backupPath = `${cachePath}.backup-${backupSuffix()}`;
  await NodeFSP.copyFile(cachePath, backupPath, NodeFS.constants.COPYFILE_EXCL);
  await writeAtomically(
    cachePath,
    `${JSON.stringify(repaired.snapshot, null, 2)}\n`,
    cacheStat.mode & 0o777,
  );
  process.stdout.write(`Backup: ${backupPath}\nCache repaired. Restart T3 Code.\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`OpenRouter cache repair failed: ${message}\n`);
  process.exitCode = 1;
});
