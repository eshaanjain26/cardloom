import { browserKeyValue } from "../deck/browser-store";
import { newId } from "../deck/ops";
import { createAiStore, providerConfig, type AiStore } from "./settings";
import type { ProviderConfig, Usage } from "./providers";

export const USAGE_EVENT = "cardloom:usage";

let store: AiStore | null = null;
export function browserAiStore(): AiStore {
  store ??= createAiStore(browserKeyValue());
  return store;
}

export class AiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function callAi<T>(
  task: "ping" | "outline" | "cards" | "agent" | "image",
  payload: Record<string, unknown>,
  deckId: string | null,
  configOverride?: ProviderConfig,
): Promise<{ data: T; eventId: string; model: string }> {
  const ai = browserAiStore();
  const config = configOverride ?? providerConfig(ai.settings());
  let res: Response;
  try {
    res = await fetch(`/api/ai/${task}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config, ...payload }),
    });
  } catch {
    throw new AiRequestError("Could not reach the Cardloom server.", 0);
  }
  const body = (await res.json().catch(() => ({}))) as { data?: T; usage?: Usage; model?: string; error?: string };
  if (!res.ok || body.data === undefined) throw new AiRequestError(body.error ?? `Request failed (${res.status})`, res.status);

  const eventId = newId();
  if (body.usage) {
    ai.record({
      id: eventId,
      deckId,
      at: new Date().toISOString(),
      task,
      provider: config.provider,
      model: body.model ?? config.model,
      inputTokens: body.usage.inputTokens,
      outputTokens: body.usage.outputTokens,
    });
    window.dispatchEvent(new Event(USAGE_EVENT));
  }
  return { data: body.data, eventId, model: body.model ?? config.model };
}
