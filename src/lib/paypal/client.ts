// PayPal REST client — TypeScript port of scripts/pp.py.
// Sandbox only (CLAUDE.md rule 1). Never puts credentials or tokens in errors or logs (rule 2).

export const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";
const TOKEN_REFRESH_MARGIN_MS = 60_000;

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface PayPalResponse<T = unknown> {
  status: number;
  body: T | null;
  debugId: string | null;
}

export interface RequestOptions {
  body?: unknown;
  // Required for anything but GET. Must be stable per logical action so a retry is idempotent
  // (rule 4) — derive it from the action, never generate it per call.
  requestId?: string;
  headers?: Record<string, string>;
}

/** The request may or may not have reached PayPal (timeout / network failure). Not a failure: retry
 *  with the same request ID. */
export class PayPalUnknownOutcome extends Error {
  constructor(
    readonly method: Method,
    readonly path: string,
    readonly requestId: string | undefined,
    cause: unknown,
  ) {
    super(`${method} ${path}: no response from PayPal (outcome unknown)`, { cause });
    this.name = "PayPalUnknownOutcome";
  }
}

export class PayPalAuthError extends Error {
  constructor(
    readonly status: number,
    readonly debugId: string | null,
  ) {
    super(`PayPal token request failed: HTTP ${status}${debugId ? ` (debug ${debugId})` : ""}`);
    this.name = "PayPalAuthError";
  }
}

export interface PayPalClientOptions {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}

export function assertSandbox(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (normalized !== SANDBOX_BASE) {
    throw new Error(`Refusing to use PayPal API base ${JSON.stringify(normalized)}: only ${SANDBOX_BASE} is allowed`);
  }
  return normalized;
}

export class PayPalClient {
  private readonly base: string;
  private readonly fetch: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private token: { value: string; expiresAt: number } | null = null;
  private tokenInFlight: Promise<string> | null = null;

  constructor(private readonly opts: PayPalClientOptions) {
    this.base = assertSandbox(opts.baseUrl);
    if (!opts.clientId || !opts.clientSecret) throw new Error("PayPal client ID and secret are required");
    this.fetch = opts.fetch ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.now = opts.now ?? Date.now;
  }

  async request<T = unknown>(method: Method, path: string, options: RequestOptions = {}): Promise<PayPalResponse<T>> {
    if (method !== "GET" && !options.requestId) {
      throw new Error(`${method} ${path} needs a stable requestId`);
    }
    if (!path.startsWith("/")) throw new Error(`PayPal path must start with "/": ${path}`);

    let res = await this.send(method, path, options, await this.accessToken());
    if (res.status === 401) {
      // Expired or revoked token: PayPal rejected the call before acting on it, so one retry with a
      // fresh token (and the same request ID) is safe.
      this.token = null;
      res = await this.send(method, path, options, await this.accessToken());
    }
    return { status: res.status, body: (await readBody(res)) as T | null, debugId: res.headers.get("paypal-debug-id") };
  }

  private async send(method: Method, path: string, options: RequestOptions, token: string): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    };
    if (options.requestId) headers["PayPal-Request-Id"] = options.requestId;
    try {
      return await this.fetch(this.base + path, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new PayPalUnknownOutcome(method, path, options.requestId, err);
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.now() < this.token.expiresAt - TOKEN_REFRESH_MARGIN_MS) return this.token.value;
    // Concurrent callers share one token request.
    this.tokenInFlight ??= this.fetchToken().finally(() => {
      this.tokenInFlight = null;
    });
    return this.tokenInFlight;
  }

  private async fetchToken(): Promise<string> {
    const basic = Buffer.from(`${this.opts.clientId.trim()}:${this.opts.clientSecret.trim()}`).toString("base64");
    const res = await this.fetch(`${this.base}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new PayPalAuthError(res.status, res.headers.get("paypal-debug-id"));
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: this.now() + body.expires_in * 1000 };
    return body.access_token;
  }
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

let shared: PayPalClient | undefined;

/** One client per process so the token cache is shared across requests. */
export function paypalFromEnv(): PayPalClient {
  shared ??= new PayPalClient({
    baseUrl: process.env.PAYPAL_API_BASE ?? "",
    clientId: process.env.PAYPAL_CLIENT_ID ?? "",
    clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? "",
  });
  return shared;
}
