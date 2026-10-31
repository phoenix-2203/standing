// JSON-schema LLM providers. Gemini is primary; Groq is an optional fallback (used only when
// GROQ_API_KEY is set). Neither ever sees credentials in prompts, and keys never appear in errors.

export interface JsonRequest {
  system: string;
  user: string;
  schemaName: string;
  // JSON Schema with every property required and no nulls, so both providers accept it as-is.
  schema: Record<string, unknown>;
}

export interface LlmProvider {
  name: "gemini" | "groq";
  model: string;
  generateJson(req: JsonRequest): Promise<unknown>;
}

export class LlmError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly status?: number,
  ) {
    super(`${provider}: ${message}`);
    this.name = "LlmError";
  }
}

interface ProviderOptions {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

// gemini-2.5-flash is closed to new API keys (404, 31 Oct 2026). 3.8 Flash can think for over 90 s on a
// hard product, so the timeout is generous.
export function gemini({ apiKey, model = "gemini-3.8-flash", fetch: f = globalThis.fetch, timeoutMs = 150_000 }: ProviderOptions): LlmProvider {
  return {
    name: "gemini",
    model,
    async generateJson(req) {
      const res = await call("gemini", f, timeoutMs, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        headers: { "x-goog-api-key": apiKey },
        body: {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: "user", parts: [{ text: req.user }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json", responseJsonSchema: req.schema },
        },
      });
      const text = (res as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("");
      return parseJson("gemini", text);
    },
  };
}

export function groq({ apiKey, model = "openai/gpt-oss-120b", fetch: f = globalThis.fetch, timeoutMs = 60_000 }: ProviderOptions): LlmProvider {
  return {
    name: "groq",
    model,
    async generateJson(req) {
      const res = await call("groq", f, timeoutMs, "https://api.groq.com/openai/v1/chat/completions", {
        headers: { Authorization: `Bearer ${apiKey}` },
        body: {
          model,
          temperature: 0,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
          response_format: { type: "json_schema", json_schema: { name: req.schemaName, schema: req.schema, strict: true } },
        },
      });
      return parseJson("groq", (res as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content);
    },
  };
}

/**
 * Providers for text tasks (policy check, pack plans), in fallback order: Groq first, Gemini second.
 * Gemini's free tier allows 20 requests/day for gemini-3.8-flash, so it's kept for invoice images and as
 * the fallback here.
 */
export function providersFromEnv(env: Record<string, string | undefined> = process.env): LlmProvider[] {
  const out: LlmProvider[] = [];
  const timeoutMs = env.LLM_TIMEOUT_MS ? Number(env.LLM_TIMEOUT_MS) : undefined;
  if (env.GROQ_API_KEY?.trim()) out.push(groq({ apiKey: env.GROQ_API_KEY.trim(), model: env.GROQ_MODEL?.trim() || undefined, timeoutMs }));
  if (env.GEMINI_API_KEY?.trim()) out.push(gemini({ apiKey: env.GEMINI_API_KEY.trim(), model: env.GEMINI_MODEL?.trim() || undefined, timeoutMs }));
  return out;
}

async function call(
  provider: string,
  f: typeof fetch,
  timeoutMs: number,
  url: string,
  { headers, body }: { headers: Record<string, string>; body: unknown },
): Promise<unknown> {
  let res: Response;
  try {
    res = await f(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new LlmError(provider, `request failed (${(err as Error).name})`);
  }
  const text = await res.text();
  if (!res.ok) {
    // Error bodies from both APIs carry a message but never echo the key; keep only a short excerpt.
    let message = text.slice(0, 200);
    try {
      const j = JSON.parse(text);
      message = j.error?.message ?? j.error?.status ?? message;
    } catch {}
    throw new LlmError(provider, `HTTP ${res.status}: ${message}`, res.status);
  }
  return JSON.parse(text);
}

function parseJson(provider: string, text: string | undefined): unknown {
  if (!text) throw new LlmError(provider, "empty response");
  try {
    return JSON.parse(text);
  } catch {
    throw new LlmError(provider, "response was not valid JSON");
  }
}
