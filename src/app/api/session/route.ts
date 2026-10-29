import { z } from "zod";
import {
  cookie,
  requireSession,
  revoke,
  sessionFor,
  sessionInfo,
  signIn,
} from "@/server/auth";
import { endpoint, json, jsonBody, originGuard } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return endpoint(async () => {
    const session = await sessionFor(request);
    return json(session ? sessionInfo(session) : { authenticated: false });
  });
}
export async function POST(request: Request) {
  return endpoint(async () => {
    originGuard(request);
    const input = z
      .object({
        username: z.string().min(1).max(200),
        password: z.string().min(1).max(1024),
      })
      .strict()
      .parse(await jsonBody(request));
    const result = await signIn(request, input.username, input.password);
    return json(result.info, 200, { "Set-Cookie": result.cookie });
  });
}
export async function DELETE(request: Request) {
  return endpoint(async () => {
    originGuard(request);
    const session = await requireSession(request);
    if (request.headers.get("x-csrf-token") !== session.csrf_token)
      return json({ error: "CSRF", message: "Invalid CSRF token." }, 403);
    await revoke(request);
    return json({ authenticated: false }, 200, { "Set-Cookie": cookie("", 0) });
  });
}
