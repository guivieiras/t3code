import { CodexSettings, ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import {
  applyOpenRouterCodexCatalog,
  fetchOpenRouterModels,
  OpenRouterCatalogError,
  openRouterModelsFromResponse,
} from "./OpenRouterCodex.ts";

const decodeCodexSettings = Schema.decodeSync(CodexSettings);
const UnusedHttpClient = HttpClient.make(() => Effect.die("Unexpected HTTP request"));
const provideUnusedHttpClient = Effect.provideService(HttpClient.HttpClient, UnusedHttpClient);

const snapshot = {
  instanceId: ProviderInstanceId.make("openrouter"),
  driver: ProviderDriverKind.make("codex"),
  displayName: "OpenRouter",
  iconKey: "openrouter",
  enabled: true,
  installed: true,
  version: "0.149.0",
  status: "ready" as const,
  auth: { status: "unknown" as const },
  checkedAt: "2026-08-23T00:00:00.000Z",
  models: [],
  slashCommands: [],
  skills: [],
};

describe("OpenRouter via Codex", () => {
  it("maps and deduplicates OpenRouter catalog models", () => {
    expect(
      openRouterModelsFromResponse({
        data: [
          { id: "anthropic/claude-sonnet-4", name: "Anthropic: Claude Sonnet 4" },
          { id: "openrouter/auto", name: "Auto Router" },
          { id: "anthropic/claude-sonnet-4", name: "Duplicate" },
          { id: "  ", name: "Invalid" },
        ],
      }),
    ).toEqual([
      {
        slug: "anthropic/claude-sonnet-4",
        name: "Anthropic: Claude Sonnet 4",
        subProvider: "Anthropic",
        isCustom: false,
        capabilities: null,
      },
      {
        slug: "openrouter/auto",
        name: "Auto Router",
        isCustom: false,
        capabilities: null,
      },
    ]);
  });

  it.effect("loads the tool-capable catalog with the instance API key", () => {
    let requestUrl = "";
    let authorization = "";
    const client = HttpClient.make((request) => {
      requestUrl = request.url;
      authorization = request.headers.authorization ?? "";
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          Response.json({ data: [{ id: "openrouter/auto", name: "Auto Router" }] }),
        ),
      );
    });

    return Effect.gen(function* () {
      const models = yield* fetchOpenRouterModels("secret-key");

      expect(requestUrl).toBe("https://openrouter.ai/api/v1/models?supported_parameters=tools");
      expect(authorization).toBe("Bearer secret-key");
      expect(models.map((model) => model.slug)).toEqual(["openrouter/auto"]);
    }).pipe(Effect.provideService(HttpClient.HttpClient, client));
  });

  it.effect("uses the authenticated OpenRouter catalog instead of Codex models", () =>
    Effect.gen(function* () {
      const result = yield* applyOpenRouterCodexCatalog(
        {
          snapshot: {
            ...snapshot,
            models: [
              {
                slug: "gpt-5.6-sol",
                name: "GPT-5.6-Sol",
                isCustom: false,
                capabilities: null,
              },
            ],
          },
          settings: decodeCodexSettings({
            connection: "openrouter",
            customModels: ["custom/model"],
          }),
          environment: { OPENROUTER_API_KEY: "sk-or-test" },
        },
        () =>
          Effect.succeed([
            {
              slug: "mistralai/mistral-large",
              name: "Mistral: Mistral Large",
              subProvider: "Mistral",
              isCustom: false,
              capabilities: null,
            },
          ]),
      );

      expect(result.status).toBe("ready");
      expect(result.auth).toEqual({
        status: "authenticated",
        type: "apiKey",
        label: "OpenRouter API key",
      });
      expect(result.models.map((model) => model.slug)).toEqual([
        "mistralai/mistral-large",
        "custom/model",
      ]);
    }).pipe(provideUnusedHttpClient),
  );

  it.effect("reports a missing API key without probing the catalog", () =>
    Effect.gen(function* () {
      let called = false;
      const result = yield* applyOpenRouterCodexCatalog(
        {
          snapshot,
          settings: decodeCodexSettings({ connection: "openrouter" }),
          environment: {},
        },
        () => {
          called = true;
          return Effect.succeed([]);
        },
      );

      expect(called).toBe(false);
      expect(result.status).toBe("error");
      expect(result.auth.status).toBe("unauthenticated");
      expect(result.message).toContain("OPENROUTER_API_KEY");
    }).pipe(provideUnusedHttpClient),
  );

  it.effect("reports catalog failures without leaking response details", () =>
    Effect.gen(function* () {
      const result = yield* applyOpenRouterCodexCatalog(
        {
          snapshot,
          settings: decodeCodexSettings({ connection: "openrouter" }),
          environment: { OPENROUTER_API_KEY: "bad-key" },
        },
        () => Effect.fail(new OpenRouterCatalogError({ cause: "401" })),
      );

      expect(result.status).toBe("error");
      expect(result.auth.status).toBe("unknown");
      expect(result.models).toEqual([]);
      expect(result.message).not.toContain("401");
    }).pipe(provideUnusedHttpClient),
  );
});
