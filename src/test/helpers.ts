import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { PayPalClient, SANDBOX_BASE } from "@/lib/paypal/client";

/** Fresh in-process Postgres with the real migrations applied. */
export async function testDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db as unknown as Db;
}

export interface Call {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string | null;
}

type Handler = (call: Call) => Response | Promise<Response>;

/** Fake PayPal: answers the token endpoint itself and routes everything else to `handler`. */
export function fakePayPal(handler: Handler, opts: { expiresIn?: number; now?: () => number } = {}) {
  const calls: Call[] = [];
  let tokens = 0;
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const call: Call = {
      method: init?.method ?? "GET",
      path: url.pathname + url.search,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === "string" ? init.body : null,
    };
    calls.push(call);
    if (url.pathname === "/v1/oauth2/token") {
      tokens += 1;
      return Response.json({ access_token: `token-${tokens}`, expires_in: opts.expiresIn ?? 32400 });
    }
    return handler(call);
  }) as typeof globalThis.fetch;
  const client = new PayPalClient({
    baseUrl: SANDBOX_BASE,
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    fetch,
    now: opts.now,
  });
  return {
    client,
    calls,
    apiCalls: () => calls.filter((c) => c.path !== "/v1/oauth2/token"),
    tokenRequests: () => tokens,
  };
}

export function json(status: number, body: unknown, debugId = "dbg-test"): Response {
  return Response.json(body, { status, headers: { "paypal-debug-id": debugId } });
}
