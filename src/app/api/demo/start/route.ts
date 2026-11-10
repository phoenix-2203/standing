import { getDb } from "@/db";
import { sessionCookie } from "@/lib/auth/session";
import {
  createDemoWorkspace,
  demoEnabled,
  liveWorkspaces,
  MAX_WORKSPACES,
  purgeDemoWorkspaces,
} from "@/lib/demo/workspace";

// "Try the demo": a private, interactive copy of the demo shop, no PayPal login needed. A POST (from the homepage's
// form), so link previews and crawlers can't create workspaces. Off unless STANDING_DEMO=1.
export async function POST(request: Request) {
  const base = (
    process.env.APP_BASE_URL ?? new URL(request.url).origin
  ).replace(/\/+$/, "");
  if (!demoEnabled()) return new Response("Not found", { status: 404 });
  const db = getDb();
  await purgeDemoWorkspaces(db);
  if ((await liveWorkspaces(db)) >= MAX_WORKSPACES) {
    return Response.redirect(`${base}/?demo=full`, 303);
  }
  const sellerId = await createDemoWorkspace(
    db,
    process.env.STANDING_DEMO_SOURCE ??
      process.env.STANDING_SELLER_ID ??
      "sandbox-seller",
  );
  const headers = new Headers({ Location: `${base}/dashboard?demo=new` });
  headers.append(
    "Set-Cookie",
    sessionCookie(
      sellerId,
      process.env.SESSION_SECRET!,
      base.startsWith("https://"),
    ),
  );
  return new Response(null, { status: 303, headers });
}
