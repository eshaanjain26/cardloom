import { describe, expect, it, vi } from "vitest";
import { createDeck } from "../deck/ops";
import type { Complete, CompleteRequest } from "./providers";
import { ProviderError } from "./providers";
import { handleAiTask, resolveConfig } from "./server";

const config = { provider: "anthropic", model: "claude-opus-5-5", apiKey: "sk-user" } as const;
const request = { mode: "prompt", input: "Coffee", cardCount: 2 };
const outline = { title: "Coffee", cards: [{ title: "A", points: [] }, { title: "B", points: [] }] };

function makeComplete(data: unknown): Complete {
  return (async (req: CompleteRequest<unknown>) => ({
    data: req.schema.parse(data),
    usage: { inputTokens: 1, outputTokens: 2 },
    model: "m",
  })) as Complete;
}

describe("resolveConfig", () => {
  const env = { ANTHROPIC_API_KEY: "sk-server" };
  it("prefers the browser key", () => {
    expect(resolveConfig(config, { ...env, CARDLOOM_SERVER_KEYS: "1" }).apiKey).toBe("sk-user");
  });
  it("uses server keys only when opted in", () => {
    const noKey = { ...config, apiKey: undefined };
    expect(resolveConfig(noKey, env).apiKey).toBeUndefined();
    expect(resolveConfig(noKey, { ...env, CARDLOOM_SERVER_KEYS: "1" }).apiKey).toBe("sk-server");
  });
});

describe("handleAiTask", () => {
  it("rejects unknown tasks and bad bodies", async () => {
    expect((await handleAiTask("nope", {}, { env: {} })).status).toBe(404);
    expect((await handleAiTask("outline", { config, request: { ...request, cardCount: 99 } }, { env: {} })).status).toBe(400);
  });

  it("runs the outline task", async () => {
    const res = await handleAiTask("outline", { config, request }, { env: {}, makeComplete: () => makeComplete(outline) });
    expect(res).toEqual({ status: 200, body: { data: outline, usage: { inputTokens: 1, outputTokens: 2 }, model: "m" } });
  });

  it("checks card ranges", async () => {
    const deps = { env: {}, makeComplete: () => makeComplete({ cards: [] }) };
    expect((await handleAiTask("cards", { config, request, outline, start: 0, end: 3 }, deps)).status).toBe(400);
    expect((await handleAiTask("cards", { config, request, outline, start: 1, end: 1 }, deps)).status).toBe(400);
    const ok = await handleAiTask("cards", { config, request, outline, start: 0, end: 2 }, deps);
    expect(ok.status).toBe(200);
    expect((ok.body as { data: { filled: number } }).data.filled).toBe(2);
  });

  it("validates the deck for the agent", async () => {
    const deps = { env: {}, makeComplete: () => makeComplete({ reply: "ok", operations: [] }) };
    expect((await handleAiTask("agent", { config, deck: { id: "x" }, message: "hi" }, deps)).status).toBe(400);
    const deck = createDeck("D", "2026-10-21T00:00:00.000Z");
    expect((await handleAiTask("agent", { config, deck, message: "hi" }, deps)).status).toBe(200);
  });

  it("passes provider errors through with their status", async () => {
    const failing = (() => {
      throw new ProviderError(401, "Add an Anthropic API key in Settings.");
    }) as unknown as () => Complete;
    const res = await handleAiTask("ping", { config: { ...config, apiKey: undefined } }, { env: {}, makeComplete: failing });
    expect(res).toEqual({ status: 401, body: { error: "Add an Anthropic API key in Settings." } });
  });

  it("hides unexpected errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = (() => (async () => {
      throw new Error("secret detail");
    })) as unknown as () => Complete;
    const res = await handleAiTask("ping", { config }, { env: {}, makeComplete: boom });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("secret");
    spy.mockRestore();
  });
});
