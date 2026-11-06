import { loginConfigFromEnv, startLogin } from "@/lib/connect/login";

export function GET(request: Request) {
  return startLogin(loginConfigFromEnv(request));
}
