import { describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";
import { createComplete, ProviderError } from "./providers";

const Schema = z.object({ answer: z.string() });
const req = { system: "sys", prompt: "q", schema: Schema };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function anthropicMessage(text: string, extra: Record<string, unknown> = {}) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 120, output_tokens: 30 },
    ...extra,
  };
}

describe("anthropic", () => {
  it("sends structured output and refusal fallbacks, returns parsed data and usage", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse(anthropicMessage('{"answer":"42"}')),
    );
    const complete = createComplete(
      { provider: "anthropic", model: "claude-opus-5-5", apiKey: "sk-test" },
      { fetch: fetchMock as unknown as typeof fetch },
    );
    const res = await complete(req);
    expect(res).toEqual({ data: { answer: "42" }, model: "claude-opus-5-5", usage: { inputTokens: 120, outputTokens: 30 } });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/v1/messages");
    const body = JSON.parse(String(init?.body));
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.fallbacks).toBe("default");
    expect(new Headers(init?.headers).get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
  });

  it("omits fallbacks for models that do not take them", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse(anthropicMessage('{"answer":"ok"}', { model: "claude-haiku-5-5" })),
    );
    await createComplete(
      { provider: "anthropic", model: "claude-haiku-5-5", apiKey: "sk-test" },
      { fetch: fetchMock as unknown as typeof fetch },
    )(req);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).fallbacks).toBeUndefined();
  });

  it("reports refusals and auth failures as ProviderError", async () => {
    const refusal = vi.fn(async () => jsonResponse(anthropicMessage("", { stop_reason: "refusal", content: [] })));
    await expect(
      createComplete({ provider: "anthropic", model: "claude-opus-5-5", apiKey: "k" }, { fetch: refusal as unknown as typeof fetch })(req),
    ).rejects.toMatchObject({ status: 422 });

    const denied = vi.fn(async () =>
      jsonResponse({ type: "error", error: { type: "authentication_error", message: "bad key" } }, 401),
    );
    await expect(
      createComplete({ provider: "anthropic", model: "claude-opus-5-5", apiKey: "k" }, { fetch: denied as unknown as typeof fetch })(req),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("requires a key", () => {
    expect(() => createComplete({ provider: "anthropic", model: "claude-opus-5-5" })).toThrow(ProviderError);
  });
});

describe("openai-compatible providers", () => {
  it("calls Ollama without a key at the configured base URL", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        model: "llama3.2",
        choices: [{ message: { content: '```json\n{"answer":"local"}\n```' } }],
        usage: { prompt_tokens: 50, completion_tokens: 10 },
      }),
    );
    const res = await createComplete(
      { provider: "ollama", model: "llama3.2", apiKey: "should-not-send" },
      { fetch: fetchMock as unknown as typeof fetch, ollamaBaseUrl: "http://gpu-box:11434" },
    )(req);
    expect(res).toEqual({ data: { answer: "local" }, model: "llama3.2", usage: { inputTokens: 50, outputTokens: 10 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://gpu-box:11434/v1/chat/completions");
    expect(new Headers(init?.headers).get("authorization")).toBeNull();
    expect(JSON.parse(String(init?.body)).messages[0].content).toContain("JSON Schema");
  });

  it("retries once on invalid output and sums usage", async () => {
    const replies = ['{"wrong":1}', '{"answer":"fixed"}'];
    const fetchMock = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: replies.shift() } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    );
    const res = await createComplete(
      { provider: "openai", model: "gpt-5", apiKey: "sk" },
      { fetch: fetchMock as unknown as typeof fetch },
    )(req);
    expect(res.data).toEqual({ answer: "fixed" });
    expect(res.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the repair attempt", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ choices: [{ message: { content: "nope" } }] }));
    await expect(
      createComplete({ provider: "openrouter", model: "openrouter/auto", apiKey: "k" }, { fetch: fetchMock as unknown as typeof fetch })(req),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("maps a 401 to a key error", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { message: "invalid" } }, 401));
    await expect(
      createComplete({ provider: "openai", model: "gpt-5", apiKey: "k" }, { fetch: fetchMock as unknown as typeof fetch })(req),
    ).rejects.toMatchObject({ status: 401, message: "OpenAI rejected the API key." });
  });
});

describe("gemini", () => {
  it("uses generateContent with JSON mode and reads usageMetadata", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        candidates: [{ content: { parts: [{ text: '{"answer":"g"}' }] } }],
        usageMetadata: { promptTokenCount: 70, candidatesTokenCount: 8 },
      }),
    );
    const res = await createComplete(
      { provider: "google", model: "gemini-2.5-flash", apiKey: "g-key" },
      { fetch: fetchMock as unknown as typeof fetch },
    )(req);
    expect(res.usage).toEqual({ inputTokens: 70, outputTokens: 8 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("models/gemini-2.5-flash:generateContent");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("g-key");
    expect(JSON.parse(String(init?.body)).generationConfig.responseMimeType).toBe("application/json");
  });
});
