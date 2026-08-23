import type { CodexSettings, ServerProvider, ServerProviderModel } from "@t3tools/contracts";
import {
  isOpenRouterCodexConnection,
  OPENROUTER_API_KEY_ENV,
  OPENROUTER_BASE_URL,
} from "@t3tools/shared/codexConnection";
import { createModelCapabilities } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import { providerModelsFromSettings } from "./providerSnapshot.ts";

const OpenRouterCatalogResponse = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.optional(Schema.String),
    }),
  ),
});

type OpenRouterCatalogResponse = typeof OpenRouterCatalogResponse.Type;

export class OpenRouterCatalogError extends Schema.TaggedErrorClass<OpenRouterCatalogError>()(
  "OpenRouterCatalogError",
  { cause: Schema.Defect() },
) {}

const CUSTOM_MODEL_CAPABILITIES = createModelCapabilities({ optionDescriptors: [] });

function splitOpenRouterModelName(name: string): {
  readonly name: string;
  readonly subProvider?: string;
} {
  const separatorIndex = name.indexOf(":");
  if (separatorIndex <= 0) return { name };

  const subProvider = name.slice(0, separatorIndex).trim();
  const shortName = name.slice(separatorIndex + 1).trim();
  if (subProvider.length === 0 || shortName.length === 0) return { name };
  return { name, subProvider };
}

export function openRouterModelsFromResponse(
  response: OpenRouterCatalogResponse,
): ReadonlyArray<ServerProviderModel> {
  const models: ServerProviderModel[] = [];
  const seen = new Set<string>();

  for (const entry of response.data) {
    const slug = entry.id.trim();
    if (slug.length === 0 || seen.has(slug)) continue;
    seen.add(slug);

    const displayName = entry.name?.trim() || slug;
    models.push({
      slug,
      ...splitOpenRouterModelName(displayName),
      isCustom: false,
      capabilities: null,
    });
  }

  return models;
}

export const fetchOpenRouterModels = Effect.fn("fetchOpenRouterModels")(function* (apiKey: string) {
  const client = yield* HttpClient.HttpClient;
  const response = yield* HttpClientRequest.get(
    `${OPENROUTER_BASE_URL}/models?supported_parameters=tools`,
  ).pipe(
    HttpClientRequest.acceptJson,
    HttpClientRequest.bearerToken(apiKey),
    client.execute,
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(OpenRouterCatalogResponse)),
    Effect.mapError((cause) => new OpenRouterCatalogError({ cause })),
  );
  return openRouterModelsFromResponse(response);
});

type OpenRouterModelLoader = (
  apiKey: string,
) => Effect.Effect<
  ReadonlyArray<ServerProviderModel>,
  OpenRouterCatalogError,
  HttpClient.HttpClient
>;

function withoutMessage(snapshot: ServerProvider): Omit<ServerProvider, "message"> {
  const { message: _message, ...rest } = snapshot;
  return rest;
}

export const applyOpenRouterCodexCatalog = Effect.fn("applyOpenRouterCodexCatalog")(function* (
  input: {
    readonly snapshot: ServerProvider;
    readonly settings: CodexSettings;
    readonly environment: NodeJS.ProcessEnv;
  },
  loadModels: OpenRouterModelLoader = fetchOpenRouterModels,
) {
  if (!isOpenRouterCodexConnection(input.settings)) return input.snapshot;

  const customModels = providerModelsFromSettings(
    [],
    input.settings.customModels,
    CUSTOM_MODEL_CAPABILITIES,
  );
  const apiKey = input.environment[OPENROUTER_API_KEY_ENV]?.trim();
  if (!apiKey) {
    return {
      ...withoutMessage(input.snapshot),
      status: "error" as const,
      auth: { status: "unauthenticated" as const, type: "apiKey" },
      message: `Missing environment variable: \`${OPENROUTER_API_KEY_ENV}\`.`,
      models: customModels,
    } satisfies ServerProvider;
  }

  if (!input.snapshot.installed || input.snapshot.status === "error") {
    return { ...input.snapshot, models: customModels } satisfies ServerProvider;
  }

  const catalogResult = yield* loadModels(apiKey).pipe(Effect.result);
  if (Result.isFailure(catalogResult) || catalogResult.success.length === 0) {
    return {
      ...withoutMessage(input.snapshot),
      status: "error" as const,
      auth: { status: "unknown" as const, type: "apiKey", label: "OpenRouter API key" },
      message: Result.isFailure(catalogResult)
        ? "Could not load the OpenRouter model catalog. Check the API key and network connection."
        : "OpenRouter returned no tool-capable text models.",
      models: customModels,
    } satisfies ServerProvider;
  }

  return {
    ...withoutMessage(input.snapshot),
    status: "ready" as const,
    auth: {
      status: "authenticated" as const,
      type: "apiKey",
      label: "OpenRouter API key",
    },
    models: providerModelsFromSettings(
      catalogResult.success,
      input.settings.customModels,
      CUSTOM_MODEL_CAPABILITIES,
    ),
  } satisfies ServerProvider;
});
