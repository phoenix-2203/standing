import { getDb } from "@/db";
import { handleCallback, loginConfigFromEnv } from "@/lib/connect/login";

export function GET(request: Request) {
  return handleCallback(request, getDb(), loginConfigFromEnv(request));
}
