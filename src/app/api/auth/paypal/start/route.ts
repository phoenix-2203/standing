import { connection } from "next/server";
import { loginConfigFromEnv, startLogin } from "@/lib/connect/login";

export async function GET(request: Request) {
  await connection(); // per-request: never prerendered at build time
  return startLogin(loginConfigFromEnv(request));
}
