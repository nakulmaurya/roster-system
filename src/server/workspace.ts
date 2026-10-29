import { z } from "zod";
import { database, transaction } from "./db";
import { Session } from "./auth";
import {
  applyProposal,
  hydrate,
  Library,
  parseLibrary,
  periodKey,
} from "./bridge";
import { reject } from "./errors";
import { canonical } from "./canonical";

export const commandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("commit"),
      revision: z.number().int().nonnegative(),
      library: z.string().max(2_000_000),
      publish: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("publish"),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;
function response(revision: number, library: Library, session: Session) {
  return {
    revision,
    ...hydrate(library),
    role: session.role,
    kind: session.kind,
  };
}
export async function readWorkspace(session: Session) {
  const { rows } = await database().query<{
    revision: number;
    library: Library;
  }>("SELECT revision,library FROM roster_workspaces WHERE id=$1", [
    session.workspace_id,
  ]);
  if (!rows.length) reject(401, "EXPIRED", "Workspace no longer exists.");
  return response(rows[0].revision, rows[0].library, session);
}
export async function writeWorkspace(session: Session, command: Command) {
  if (session.role !== "manager")
    reject(403, "FORBIDDEN", "Viewer sessions cannot modify workspaces.");
  return transaction(async (client) => {
    // Revalidate session inside the transaction after acquiring the workspace lock. Revocation/expiry cannot be bypassed by a queued write.
    const { rows } = await client.query<{ revision: number; library: Library }>(
      `SELECT revision,library FROM roster_workspaces
      WHERE id=$1 AND (expires_at IS NULL OR expires_at>now()) FOR UPDATE`,
      [session.workspace_id],
    );
    if (!rows.length)
      reject(401, "EXPIRED", "Workspace expired. Start a new demo or sign in.");
    const active = await client.query(
      `SELECT token_hash FROM roster_sessions WHERE token_hash=$1 AND workspace_id=$2 AND role='manager' AND expires_at>clock_timestamp() FOR SHARE`,
      [session.token_hash, session.workspace_id],
    );
    if (!active.rowCount)
      reject(401, "EXPIRED", "Session expired. Sign in again.");
    const row = rows[0];
    if (row.revision !== command.revision)
      reject(
        409,
        "STALE_REVISION",
        "Workspace changed. Reload the latest version before retrying.",
      );
    const proposed =
      command.type === "commit" ? parseLibrary(command.library) : row.library;
    const next = applyProposal(
      row.library,
      proposed,
      command.type === "publish" || Boolean(command.publish),
    );
    const stored = await client.query<{
      period: string;
      version: number;
      snapshot: unknown;
    }>(
      "SELECT period,version,snapshot FROM roster_publications WHERE workspace_id=$1",
      [session.workspace_id],
    );
    const ledger = new Map(
      stored.rows.map((row) => [`${row.period}:${row.version}`, row.snapshot]),
    );
    const inserted = new Set<string>();
    const additions: { period: string; version: number; snapshot: unknown }[] =
      [];
    for (const doc of Object.values(next.library.workspaces))
      for (const snapshot of doc.publications) {
        const period = periodKey(doc),
          key = `${period}:${snapshot.version}`;
        if (inserted.has(key)) continue;
        inserted.add(key);
        if (ledger.has(key)) {
          if (canonical(ledger.get(key)) !== canonical(snapshot))
            reject(422, "HISTORY_IMMUTABLE", "Stored publication mismatch.");
        } else additions.push({ period, version: snapshot.version, snapshot });
      }
    if ([...ledger.keys()].some((key) => !inserted.has(key)))
      reject(
        422,
        "HISTORY_IMMUTABLE",
        "Stored publications cannot be removed.",
      );
    if (additions.length)
      await client.query(
        `INSERT INTO roster_publications(workspace_id,period,version,snapshot)
      SELECT $1,x.period,x.version,x.snapshot FROM jsonb_to_recordset($2::jsonb) AS x(period text,version integer,snapshot jsonb)`,
        [session.workspace_id, JSON.stringify(additions)],
      );
    const updated = await client.query(
      `UPDATE roster_workspaces SET library=$1,revision=revision+1 WHERE id=$2 AND revision=$3 RETURNING revision`,
      [next.library, session.workspace_id, command.revision],
    );
    if (!updated.rowCount) reject(409, "STALE_REVISION", "Workspace changed.");
    return {
      revision: updated.rows[0].revision,
      library: JSON.stringify(next.library),
      workspace: next.workspace,
      role: session.role,
      kind: session.kind,
    };
  });
}
