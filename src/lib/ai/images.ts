import { ProviderError, type Usage } from "./providers";

export const DEFAULT_IMAGE_MODEL = "gpt-image-1";
export const IMAGE_SIZES = ["1536x1024", "1024x1024", "1024x1536"] as const;

export async function generateImage(
  args: { apiKey?: string; model: string; prompt: string; size: (typeof IMAGE_SIZES)[number] },
  doFetch: typeof fetch = fetch,
): Promise<{ b64: string; mime: string; usage: Usage; model: string }> {
  if (!args.apiKey) throw new ProviderError(401, "Add an OpenAI API key in Settings to generate images.");
  let res: Response;
  try {
    res = await doFetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${args.apiKey}` },
      body: JSON.stringify({
        model: args.model,
        prompt: args.prompt,
        size: args.size,
        n: 1,
        quality: "medium",
        output_format: "webp",
      }),
    });
  } catch {
    throw new ProviderError(502, "Could not reach OpenAI.");
  }
  if (res.status === 401 || res.status === 403) throw new ProviderError(401, "OpenAI rejected the API key.");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new ProviderError(res.status === 429 ? 429 : 502, `OpenAI image error ${res.status}${body.error?.message ? `: ${body.error.message.slice(0, 300)}` : ""}`);
  }
  const body = (await res.json()) as {
    data?: { b64_json?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new ProviderError(502, "OpenAI returned no image.");
  return {
    b64,
    mime: "image/webp",
    model: args.model,
    usage: { inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0 },
  };
}
