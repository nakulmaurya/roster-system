import { ZodError } from "zod";
import { HttpError, reject } from "./errors";

export const MAX_BODY = 2_000_000;
export function originGuard(request: Request) {
  const origin = process.env.APP_ORIGIN;
  if (!origin) reject(503, "CONFIG", "Server origin is not configured.");
  if (
    request.headers.get("origin") !== origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    reject(403, "ORIGIN", "Cross-origin requests are not permitted.");
}
export async function jsonBody(request: Request): Promise<unknown> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    reject(415, "CONTENT_TYPE", "Use application/json.");
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY)
    reject(413, "BODY_LIMIT", "Request exceeds 2 MB.");
  if (!request.body) reject(400, "JSON", "A JSON body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) {
        await reader.cancel();
        reject(413, "BODY_LIMIT", "Request exceeds 2 MB.");
      }
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      reject(400, "JSON", "Malformed JSON.");
    }
  } finally {
    reader.releaseLock();
  }
}
export function json(value: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
export async function endpoint(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.code, message: error.message }, error.status);
    if (error instanceof ZodError || error instanceof SyntaxError)
      return json(
        { error: "VALIDATION", message: "Invalid request or workspace data." },
        422,
      );
    // Never expose SQL, credentials, session tokens, connection strings, or stack traces.
    console.error(
      "Roster API failure",
      error instanceof Error ? error.name : "UnknownError",
    );
    return json(
      {
        error: "UNAVAILABLE",
        message: "Workspace service unavailable. Retry later.",
      },
      503,
    );
  }
}
