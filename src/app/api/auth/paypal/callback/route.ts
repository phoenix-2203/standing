import { connection } from "next/server";
import { getDb } from "@/db";
import { handleCallback, loginConfigFromEnv } from "@/lib/connect/login";

export async function GET(request: Request) {
  await connection(); // per-request: never prerendered at build time
  return handleCallback(request, getDb(), loginConfigFromEnv(request));
}
