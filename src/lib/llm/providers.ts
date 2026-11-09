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
  /** Wait before the one retry of a transient failure (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
// Busy or briefly failing upstream: worth one more try. A timeout isn't (it already waited the full time),
// and 4xx other than 429 means the request itself is wrong.
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
// Groq's free tier is 8,000 tokens a minute and one Ask is ~5,600, so a second question within a minute gets a 429
// with Retry-After around 15–20 s. Waiting that long once beats failing; longer than 20 s and we give up instead.
const MAX_RETRY_WAIT_MS = 20_000;
const DEFAULT_RETRY_WAIT_MS = 1_000;

// Retry-After comes in whole seconds and Groq rounds it down (17.05 s needed, "17" sent), so a retry at exactly
// that time hits the same limit; one second of margin clears it.
const RETRY_MARGIN_MS = 1_000;

/** How long to wait before retrying, from Retry-After (seconds) plus a margin when present, capped so a page never hangs. */
export function retryWaitMs(retryAfter: string | null): number {
  const secs = retryAfter === null ? NaN : Number(retryAfter);
  if (!Number.isFinite(secs) || secs < 0) return DEFAULT_RETRY_WAIT_MS;
  return secs === 0 ? 0 : Math.min(secs * 1000 + RETRY_MARGIN_MS, MAX_RETRY_WAIT_MS);
}

// gemini-2.5-flash is closed to new API keys (404, 31 Oct 2026). 3.8 Flash can think for over 90 s on a
// hard product, so the timeout is generous.
export function gemini({ apiKey, model = "gemini-3.8-flash", fetch: f = globalThis.fetch, timeoutMs = 150_000, sleep = realSleep }: ProviderOptions): LlmProvider {
  return {
    name: "gemini",
    model,
    async generateJson(req) {
      const res = await call("gemini", f, timeoutMs, sleep, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
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

export function groq({ apiKey, model = "openai/gpt-oss-120b", fetch: f = globalThis.fetch, timeoutMs = 60_000, sleep = realSleep }: ProviderOptions): LlmProvider {
  return {
    name: "groq",
    model,
    async generateJson(req) {
      const res = await call("groq", f, timeoutMs, sleep, "https://api.groq.com/openai/v1/chat/completions", {
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
export function providersFromEnv(env: Record<string, string | undefined> = process.env, opts: { timeoutMs?: number } = {}): LlmProvider[] {
  const out: LlmProvider[] = [];
  const timeoutMs = env.LLM_TIMEOUT_MS ? Number(env.LLM_TIMEOUT_MS) : opts.timeoutMs;
  if (env.GROQ_API_KEY?.trim()) out.push(groq({ apiKey: env.GROQ_API_KEY.trim(), model: env.GROQ_MODEL?.trim() || undefined, timeoutMs }));
  if (env.GEMINI_API_KEY?.trim()) out.push(gemini({ apiKey: env.GEMINI_API_KEY.trim(), model: env.GEMINI_MODEL?.trim() || undefined, timeoutMs }));
  return out;
}

async function call(
  provider: string,
  f: typeof fetch,
  timeoutMs: number,
  sleep: (ms: number) => Promise<void>,
  url: string,
  { headers, body }: { headers: Record<string, string>; body: unknown },
): Promise<unknown> {
  const send = () =>
    f(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  // At most one retry (two for a 429), for a busy upstream (429/5xx) or a dropped connection, so a single blip doesn't
  // reach the seller. A timeout isn't retried: it already waited the full time.
  const attempt = async (): Promise<Response> => {
    try {
      return await send();
    } catch (err) {
      throw new LlmError(provider, `request failed (${(err as Error).name})`);
    }
  };
  let res: Response;
  for (let tries = 1; ; tries++) {
    try {
      res = await attempt();
    } catch (err) {
      if (tries >= 2 || (err as LlmError).message.endsWith("(TimeoutError)")) throw err;
      await sleep(DEFAULT_RETRY_WAIT_MS);
      continue;
    }
    // A rate limit (429) gets one extra try: Groq's per-minute token budget refills continuously, so a second
    // question asked moments after the first can need two waits. Other failures still get a single retry.
    const maxTries = res.status === 429 ? 3 : 2;
    if (tries >= maxTries || !TRANSIENT_STATUS.has(res.status)) break;
    await res.body?.cancel().catch(() => {});
    await sleep(retryWaitMs(res.headers.get("retry-after")));
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
