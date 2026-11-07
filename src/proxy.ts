import type { NextRequest } from "next/server";
import { crossSiteWrite } from "@/lib/auth/origin";

// Runs before every /api route: refuses browser writes that come from another site (see lib/auth/origin.ts).
export function proxy(request: NextRequest) {
  const reason = crossSiteWrite(request);
  if (reason) return Response.json({ error: "cross_site_request" }, { status: 403 });
}

export const config = {
  matcher: "/api/:path*",
};
