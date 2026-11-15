import type { CodexSettings, ServerProvider, ServerProviderModel } from "@t3tools/contracts";
import { providerModelsFromSettings } from "@t3tools/provider-core/server/snapshotProbe";
import { OPENROUTER_API_KEY_ENV, OPENROUTER_BASE_URL } from "@t3tools/shared/codexConnection";
import { createModelCapabilities } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest } from "effect/http";

const OpenRouterCatalogResponse = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.optional(Schema.String),
    }),
  ),
});
type OpenRouterCatalogResponse = typeof OpenRouterCatalogResponse.Type;

export class OpenRouterCatalogError extends Schema.TaggedError<OpenRouterCatalogError>()(
  "OpenRouterCatalogError",
  { cause: Schema.Defect() },
) {}

const CUSTOM_MODEL_CAPABILITIES = createModelCapabilities({ optionDescriptors: [] });

/** OpenRouter names read "Publisher: Model"; the publisher becomes the sub-provider label. */
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
    models.push({
      slug,
      ...splitOpenRouterModelName(entry.name?.trim() || slug),
      isCustom: false,
      capabilities: null,
    });
  }
  return models;
}

/** Codex drives tools on every turn, so only tool-capable models are listed. */
export const fetchOpenRouterModels = Effect.fn("fetchOpenRouterModels")(function* (apiKey: string) {
  const http = yield* HttpClient.HttpClient;
  const catalog = yield* http
    .execute(
      HttpClientRequest.get(`${OPENROUTER_BASE_URL}/models?supported_parameters=tools`).pipe(
        HttpClientRequest.acceptJson,
        HttpClientRequest.bearerToken(apiKey),
      ),
    )
    .pipe(
      Effect.filterOrFail(
        (response) => response.status === 200,
        (response) => new OpenRouterCatalogError({ cause: `HTTP ${response.status}` }),
      ),
      Effect.flatMap((response) => response.json),
      Effect.flatMap(Schema.decodeUnknownEffect(OpenRouterCatalogResponse)),
      Effect.timeout("15 seconds"),
      Effect.catchTags({
        HttpClientError: (cause) => Effect.fail(new OpenRouterCatalogError({ cause })),
        SchemaError: (cause) => Effect.fail(new OpenRouterCatalogError({ cause })),
        TimeoutError: (cause) => Effect.fail(new OpenRouterCatalogError({ cause })),
      }),
    );
  return openRouterModelsFromResponse(catalog);
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

/**
 * Replace a Codex probe's OpenAI models with the OpenRouter catalog for the instance's API key.
 * Failures keep only custom models and say what to fix without echoing the response.
 */
export const applyOpenRouterCodexCatalog = Effect.fn("applyOpenRouterCodexCatalog")(function* (
  input: {
    readonly snapshot: ServerProvider;
    readonly settings: CodexSettings;
    readonly environment: NodeJS.ProcessEnv;
  },
  loadModels: OpenRouterModelLoader = fetchOpenRouterModels,
) {
  const customModels = providerModelsFromSettings(
    [],
    input.settings.customModels,
    CUSTOM_MODEL_CAPABILITIES,
  );
  const apiKey = input.environment[OPENROUTER_API_KEY_ENV]?.trim();
  if (!apiKey) {
    return {
      ...withoutMessage(input.snapshot),
      status: "error",
      auth: { status: "unauthenticated", type: "apiKey" },
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
      status: "error",
      auth: { status: "unknown", type: "apiKey", label: "OpenRouter API key" },
      message: Result.isFailure(catalogResult)
        ? "Could not load the OpenRouter model catalog. Check the API key and network connection."
        : "OpenRouter returned no tool-capable models.",
      models: customModels,
    } satisfies ServerProvider;
  }

  return {
    ...withoutMessage(input.snapshot),
    status: "ready",
    auth: { status: "authenticated", type: "apiKey", label: "OpenRouter API key" },
    models: providerModelsFromSettings(
      catalogResult.success,
      input.settings.customModels,
      CUSTOM_MODEL_CAPABILITIES,
    ),
  } satisfies ServerProvider;
});
