import { z } from "zod";
import { createDemo } from "@/server/auth";
import { endpoint, json, jsonBody, originGuard } from "@/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return endpoint(async () => {
    originGuard(request);
    z.object({})
      .strict()
      .parse(await jsonBody(request));
    const result = await createDemo(request);
    return json(
      result.info,
      200,
      result.cookie ? { "Set-Cookie": result.cookie } : undefined,
    );
  });
}
