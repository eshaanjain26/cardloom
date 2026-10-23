import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { extractJson } from "./json";

export const PROVIDERS = ["anthropic", "openai", "google", "openrouter", "ollama"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
  google: "Google (Gemini)",
  openrouter: "OpenRouter",
  ollama: "Ollama (local, offline)",
};

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: "claude-opus-5-5",
  openai: "gpt-5",
  google: "gemini-2.5-flash",
  openrouter: "openrouter/auto",
  ollama: "llama3.2",
};

export const ENV_KEYS: Record<ProviderId, string | null> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  ollama: null,
};

export const ProviderConfigSchema = z.object({
  provider: z.enum(PROVIDERS),
  model: z.string().trim().min(1).max(200),
  apiKey: z.string().max(500).optional(),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export type Usage = { inputTokens: number; outputTokens: number };

export type CompleteRequest<T> = {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
};

export type CompleteResult<T> = { data: T; usage: Usage; model: string };

export type Complete = <T>(req: CompleteRequest<T>) => Promise<CompleteResult<T>>;

export class ProviderError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Deps = { fetch?: typeof fetch; ollamaBaseUrl?: string };

// Models that accept the server-side refusal fallback (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

function anthropicComplete(config: ProviderConfig, deps: Deps): Complete {
  if (!config.apiKey) throw new ProviderError(401, "Add an Anthropic API key in Settings.");
  const client = new Anthropic({ apiKey: config.apiKey, fetch: deps.fetch, maxRetries: 2 });

  return async <T,>({ system, prompt, schema, maxTokens = 16000 }: CompleteRequest<T>) => {
    const fallback = FALLBACK_MODELS.has(config.model);
    let res;
    try {
      res = await client.beta.messages.parse({
        model: config.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
        output_config: { format: betaZodOutputFormat(schema) },
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new ProviderError(401, "Anthropic rejected the API key.");
      if (err instanceof Anthropic.RateLimitError) throw new ProviderError(429, "Anthropic rate limit hit. Try again shortly.");
      if (err instanceof Anthropic.APIConnectionError) throw new ProviderError(502, "Could not reach Anthropic.");
      if (err instanceof Anthropic.APIError) throw new ProviderError(err.status ?? 502, err.message);
      throw err;
    }
    if (res.stop_reason === "refusal") throw new ProviderError(422, "The model declined this request.");
    if (res.stop_reason === "max_tokens") throw new ProviderError(502, "The response was cut off. Try fewer cards.");
    if (res.parsed_output == null) throw new ProviderError(502, "The model returned output that did not match the schema.");
    const u = res.usage;
    return {
      data: res.parsed_output,
      model: res.model,
      usage: {
        inputTokens: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
        outputTokens: u.output_tokens,
      },
    };
  };
}

type RawCall = (system: string, prompt: string) => Promise<{ text: string; usage: Usage; model: string }>;

async function readError(res: Response, provider: string): Promise<ProviderError> {
  let detail = "";
  try {
    const body = (await res.json()) as { error?: { message?: string } | string };
    detail = typeof body.error === "string" ? body.error : (body.error?.message ?? "");
  } catch {
    // Non-JSON error bodies fall through to the generic message.
  }
  if (res.status === 401 || res.status === 403) return new ProviderError(401, `${provider} rejected the API key.`);
  return new ProviderError(res.status === 429 ? 429 : 502, `${provider} error ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
}

function openAICompatible(baseUrl: string, label: string, config: ProviderConfig, deps: Deps, needsKey: boolean): RawCall {
  if (needsKey && !config.apiKey) throw new ProviderError(401, `Add a ${label} API key in Settings.`);
  const doFetch = deps.fetch ?? fetch;
  return async (system, prompt) => {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        }),
      });
    } catch {
      throw new ProviderError(502, `Could not reach ${label}.`);
    }
    if (!res.ok) throw await readError(res, label);
    const body = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: body.choices?.[0]?.message?.content ?? "",
      model: body.model ?? config.model,
      usage: { inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0 },
    };
  };
}

function gemini(config: ProviderConfig, deps: Deps): RawCall {
  if (!config.apiKey) throw new ProviderError(401, "Add a Gemini API key in Settings.");
  const doFetch = deps.fetch ?? fetch;
  return async (system, prompt) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
    let res: Response;
    try {
      res = await doFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": config.apiKey! },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      });
    } catch {
      throw new ProviderError(502, "Could not reach Gemini.");
    }
    if (!res.ok) throw await readError(res, "Gemini");
    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    return {
      text: (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join(""),
      model: config.model,
      usage: {
        inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  };
}

// Providers without schema-constrained decoding get the JSON schema in the
// system prompt, then one repair attempt if the reply fails validation.
function jsonViaPrompt(call: RawCall): Complete {
  return async <T,>({ system, prompt, schema }: CompleteRequest<T>) => {
    const jsonSchema = JSON.stringify(z.toJSONSchema(schema));
    const sys = `${system}\n\nReply with a single JSON object and nothing else. It must match this JSON Schema:\n${jsonSchema}`;
    const usage: Usage = { inputTokens: 0, outputTokens: 0 };
    let userPrompt = prompt;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await call(sys, userPrompt);
      usage.inputTokens += res.usage.inputTokens;
      usage.outputTokens += res.usage.outputTokens;
      let problem: string;
      try {
        const parsed = schema.safeParse(extractJson(res.text));
        if (parsed.success) return { data: parsed.data, usage, model: res.model };
        problem = z.prettifyError(parsed.error);
      } catch (err) {
        problem = err instanceof Error ? err.message : "invalid JSON";
      }
      userPrompt = `${prompt}\n\nYour previous reply was invalid (${problem.slice(0, 500)}). Reply again with only the corrected JSON object.`;
    }
    throw new ProviderError(502, "The model did not return valid JSON after a retry.");
  };
}

export function createComplete(config: ProviderConfig, deps: Deps = {}): Complete {
  switch (config.provider) {
    case "anthropic":
      return anthropicComplete(config, deps);
    case "openai":
      return jsonViaPrompt(openAICompatible("https://api.openai.com/v1", "OpenAI", config, deps, true));
    case "openrouter":
      return jsonViaPrompt(openAICompatible("https://openrouter.ai/api/v1", "OpenRouter", config, deps, true));
    case "ollama":
      return jsonViaPrompt(
        openAICompatible(`${deps.ollamaBaseUrl ?? "http://127.0.0.1:11434"}/v1`, "Ollama", { ...config, apiKey: undefined }, deps, false),
      );
    case "google":
      return jsonViaPrompt(gemini(config, deps));
  }
}
