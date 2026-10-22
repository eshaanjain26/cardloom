import { z } from "zod/v4";
import { DeckSchema } from "../deck/schema";
import { generateImage, IMAGE_SIZES } from "./images";
import { CARD_BATCH_SIZE, generateCards, generateOutline, runAgent } from "./pipelines";
import {
  createComplete,
  ENV_KEYS,
  ProviderConfigSchema,
  ProviderError,
  type Complete,
  type ProviderConfig,
} from "./providers";
import { MAX_CARDS, OutlineRequestSchema, OutlineSchema } from "./schemas";

type Env = Record<string, string | undefined>;
type Deps = { env: Env; fetch?: typeof fetch; makeComplete?: (config: ProviderConfig) => Complete };

export type AiResponse = { status: number; body: unknown };

// A key typed in the browser always wins. Keys from the server environment are
// used only when the operator opts in, because anyone who can reach the server
// could otherwise spend them.
export function resolveConfig(config: ProviderConfig, env: Env): ProviderConfig {
  if (config.apiKey) return config;
  const envName = ENV_KEYS[config.provider];
  if (envName && env.CARDLOOM_SERVER_KEYS === "1" && env[envName]) return { ...config, apiKey: env[envName] };
  return config;
}

const TurnSchema = z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) });

const bodies = {
  ping: z.object({ config: ProviderConfigSchema }),
  outline: z.object({ config: ProviderConfigSchema, request: OutlineRequestSchema }),
  cards: z.object({
    config: ProviderConfigSchema,
    request: OutlineRequestSchema,
    outline: OutlineSchema,
    start: z.number().int().min(0),
    end: z.number().int().min(1),
  }),
  agent: z.object({
    config: ProviderConfigSchema,
    deck: z.unknown(),
    message: z.string().trim().min(1).max(4000),
    history: z.array(TurnSchema).max(12).default([]),
    focusCardId: z.string().max(100).optional(),
  }),
  image: z.object({
    config: ProviderConfigSchema,
    prompt: z.string().trim().min(1).max(2000),
    size: z.enum(IMAGE_SIZES).default("1536x1024"),
  }),
};

export type AiTask = keyof typeof bodies;

function bad(message: string, status = 400): AiResponse {
  return { status, body: { error: message } };
}

export async function handleAiTask(task: string, raw: unknown, deps: Deps): Promise<AiResponse> {
  if (!(task in bodies)) return bad("Unknown task", 404);
  const parsed = bodies[task as AiTask].safeParse(raw);
  if (!parsed.success) return bad(z.prettifyError(parsed.error));

  const config = resolveConfig(parsed.data.config, deps.env);
  if (task === "image") {
    if (config.provider !== "openai") return bad("Image generation currently supports OpenAI only.");
    const { prompt, size } = parsed.data as z.infer<typeof bodies.image>;
    try {
      const res = await generateImage({ apiKey: config.apiKey, model: config.model, prompt, size }, deps.fetch);
      return { status: 200, body: { data: { b64: res.b64, mime: res.mime }, usage: res.usage, model: res.model } };
    } catch (err) {
      if (err instanceof ProviderError) return bad(err.message, err.status);
      console.error("[ai:image]", err);
      return bad("Image generation failed. Check the server log.", 500);
    }
  }
  try {
    const complete =
      deps.makeComplete?.(config) ??
      createComplete(config, { fetch: deps.fetch, ollamaBaseUrl: deps.env.OLLAMA_BASE_URL });

    switch (task as Exclude<AiTask, "image">) {
      case "ping": {
        const res = await complete({
          system: "Connectivity check.",
          prompt: 'Return {"ok": true}.',
          schema: z.object({ ok: z.boolean() }),
          maxTokens: 1000,
        });
        return { status: 200, body: { data: res.data, usage: res.usage, model: res.model } };
      }
      case "outline": {
        const { request } = parsed.data as z.infer<typeof bodies.outline>;
        const res = await generateOutline(complete, request);
        return { status: 200, body: { data: res.outline, usage: res.usage, model: res.model } };
      }
      case "cards": {
        const { request, outline, start, end } = parsed.data as z.infer<typeof bodies.cards>;
        if (outline.cards.length > MAX_CARDS || end > outline.cards.length || start >= end || end - start > CARD_BATCH_SIZE) {
          return bad("Invalid card range");
        }
        const res = await generateCards(complete, { request, outline, start, end });
        return { status: 200, body: { data: { cards: res.cards, filled: res.filled }, usage: res.usage, model: res.model } };
      }
      case "agent": {
        const body = parsed.data as z.infer<typeof bodies.agent>;
        const deck = DeckSchema.safeParse(body.deck);
        if (!deck.success) return bad("Invalid deck");
        const res = await runAgent(complete, {
          deck: deck.data,
          message: body.message,
          history: body.history,
          focusCardId: body.focusCardId,
        });
        return { status: 200, body: { data: res.result, usage: res.usage, model: res.model } };
      }
    }
  } catch (err) {
    if (err instanceof ProviderError) return bad(err.message, err.status);
    console.error(`[ai:${task}]`, err);
    return bad("Generation failed. Check the server log.", 500);
  }
}
