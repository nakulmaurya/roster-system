import { requireSession } from "@/server/auth";
import { endpoint, json, jsonBody, originGuard } from "@/server/http";
import {
  commandSchema,
  readWorkspace,
  writeWorkspace,
} from "@/server/workspace";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return endpoint(async () =>
    json(await readWorkspace(await requireSession(request))),
  );
}
export async function POST(request: Request) {
  return endpoint(async () => {
    originGuard(request);
    const session = await requireSession(request, true);
    const command = commandSchema.parse(await jsonBody(request));
    return json(await writeWorkspace(session, command));
  });
}
