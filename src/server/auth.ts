import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { PoolClient } from "pg";
import { database, transaction } from "./db";
import { seedLibrary } from "./bridge";
import { reject } from "./errors";

const scryptAsync = promisify(scrypt);
export const COOKIE = "roster_session";
export type Role = "manager" | "viewer";
export interface Session {
  token_hash: string;
  workspace_id: string;
  role: Role;
  csrf_token: string;
  expires_at: Date;
  kind: "real" | "demo";
}
export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function integerEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const raw = process.env[name];
  const value = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`Invalid ${name}`);
  return value;
}
function cookieToken(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
}
export async function sessionFor(request: Request): Promise<Session | null> {
  const token = cookieToken(request);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const result = await database().query<Session>(
    `SELECT s.*,w.kind FROM roster_sessions s JOIN roster_workspaces w ON w.id=s.workspace_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND (w.expires_at IS NULL OR w.expires_at>now())`,
    [digest(token)],
  );
  return result.rows[0] ?? null;
}
export async function requireSession(request: Request, write = false) {
  const session = await sessionFor(request);
  if (!session)
    reject(401, "UNAUTHENTICATED", "Sign in or explicitly start a demo.");
  if (write && session.role !== "manager")
    reject(403, "FORBIDDEN", "Viewer sessions cannot modify workspaces.");
  if (write && request.headers.get("x-csrf-token") !== session.csrf_token)
    reject(403, "CSRF", "Invalid CSRF token. Reload the session.");
  return session;
}
export function cookie(value: string, maxAge: number) {
  const loopbackTest =
    process.env.ALLOW_INSECURE_LOCALHOST === "true" &&
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(
      process.env.APP_ORIGIN ?? "",
    );
  const secure =
    (process.env.NODE_ENV === "production" && !loopbackTest) ||
    process.env.SESSION_COOKIE_SECURE === "true";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
export function sessionInfo(session: Session) {
  return {
    authenticated: true,
    role: session.role,
    kind: session.kind,
    csrfToken: session.csrf_token,
    expiresAt: session.expires_at.toISOString(),
  };
}
async function issue(
  client: PoolClient,
  workspaceId: string,
  role: Role,
  kind: Session["kind"],
) {
  const token = randomBytes(32).toString("hex"),
    csrf = randomBytes(32).toString("hex");
  const seconds =
    kind === "demo"
      ? integerEnv("DEMO_TTL_SECONDS", 86400, 300, 172800)
      : 28800;
  const { rows } = await client.query<{ expires_at: Date }>(
    `INSERT INTO roster_sessions(token_hash,workspace_id,role,csrf_token,expires_at)
    VALUES ($1,$2,$3,$4,now()+$5*interval '1 second') RETURNING expires_at`,
    [digest(token), workspaceId, role, csrf, seconds],
  );
  return {
    info: sessionInfo({
      token_hash: digest(token),
      workspace_id: workspaceId,
      role,
      kind,
      csrf_token: csrf,
      expires_at: rows[0].expires_at,
    }),
    cookie: cookie(token, seconds),
  };
}
export async function revoke(request: Request) {
  const token = cookieToken(request);
  if (token)
    await database().query("DELETE FROM roster_sessions WHERE token_hash=$1", [
      digest(token),
    ]);
}
async function cleanup(client: PoolClient) {
  await client.query(`DELETE FROM roster_workspaces WHERE id IN (SELECT id FROM roster_workspaces
    WHERE kind='demo' AND expires_at<now() ORDER BY expires_at LIMIT 25)`);
  await client.query(
    `DELETE FROM roster_sessions WHERE token_hash IN (SELECT token_hash FROM roster_sessions WHERE expires_at<now() LIMIT 200)`,
  );
  await client.query(
    `DELETE FROM roster_rate_events WHERE ctid IN (SELECT ctid FROM roster_rate_events WHERE occurred_at<now()-interval '1 hour' LIMIT 1000)`,
  );
}
async function rate(
  client: PoolClient,
  bucket: string,
  limit: number,
  seconds: number,
) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `roster:${bucket}`,
  ]);
  const { rows } = await client.query<{ count: string }>(
    "SELECT count(*) FROM roster_rate_events WHERE bucket=$1 AND occurred_at>now()-$2*interval '1 second'",
    [bucket, seconds],
  );
  if (Number(rows[0].count) >= limit)
    reject(429, "RATE_LIMIT", "Too many requests. Try again later.");
  await client.query("INSERT INTO roster_rate_events(bucket) VALUES ($1)", [
    bucket,
  ]);
}
export async function createDemo(request: Request) {
  const existing = await sessionFor(request);
  // Explicit action, but do not allocate/renew if already holding an unexpired isolated demo.
  if (existing?.kind === "demo")
    return { info: sessionInfo(existing), cookie: undefined };
  return transaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('roster:demo-provision'))",
    );
    await cleanup(client);
    await rate(
      client,
      "demo-global",
      integerEnv("DEMO_RATE_PER_10_MIN", 40, 1, 200),
      600,
    );
    const { rows } = await client.query<{ count: string }>(
      "SELECT count(*) FROM roster_workspaces WHERE kind='demo'",
    );
    if (
      Number(rows[0].count) >= integerEnv("DEMO_MAX_WORKSPACES", 200, 1, 1000)
    )
      reject(
        429,
        "DEMO_CAP",
        "Demo capacity reached. Try again after old demos expire.",
      );
    const id = randomUUID();
    const library = seedLibrary();
    const ttl = integerEnv("DEMO_TTL_SECONDS", 86400, 300, 172800);
    await client.query(
      "INSERT INTO roster_workspaces(id,kind,library,expires_at) VALUES ($1,'demo',$2,now()+$3*interval '1 second')",
      [id, library, ttl],
    );
    // Rotate any former real session token when switching workspace.
    const old = cookieToken(request);
    if (old)
      await client.query("DELETE FROM roster_sessions WHERE token_hash=$1", [
        digest(old),
      ]);
    return issue(client, id, "manager", "demo");
  });
}
export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, hash] = encoded.split("$");
  if (
    algorithm !== "scrypt" ||
    !/^[a-f0-9]{32}$/.test(salt ?? "") ||
    !/^[a-f0-9]{128}$/.test(hash ?? "")
  )
    return false;
  const actual = (await scryptAsync(
    password,
    Buffer.from(salt, "hex"),
    64,
  )) as Buffer;
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}
export async function signIn(
  request: Request,
  username: string,
  password: string,
) {
  // Count failures in a separate committed transaction, including nonexistent accounts.
  await transaction(async (client) => {
    await cleanup(client);
    await rate(client, "signin-global", 30, 600);
  });
  const manager = username === process.env.ROSTER_ADMIN_USERNAME;
  const viewer = username === process.env.ROSTER_VIEWER_USERNAME;
  const hash = manager
    ? process.env.ROSTER_ADMIN_PASSWORD_HASH
    : viewer
      ? process.env.ROSTER_VIEWER_PASSWORD_HASH
      : undefined;
  // Same scrypt workload even for unknown account / malformed credential configuration.
  const dummy = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;
  const valid = await verifyPassword(
    password,
    hash && /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash) ? hash : dummy,
  );
  if (!hash || !valid || (!manager && !viewer))
    reject(401, "CREDENTIALS", "Invalid username or password.");
  const workspaceId =
    process.env.ROSTER_REAL_WORKSPACE_ID ??
    "00000000-0000-4000-8000-000000000001";
  if (!/^[a-f0-9-]{36}$/i.test(workspaceId))
    throw new Error("Invalid real workspace configuration");
  return transaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('roster:real-provision'))",
    );
    const found = await client.query(
      "SELECT id FROM roster_workspaces WHERE id=$1 AND kind='real'",
      [workspaceId],
    );
    if (!found.rowCount)
      await client.query(
        "INSERT INTO roster_workspaces(id,kind,library) VALUES ($1,'real',$2)",
        [workspaceId, seedLibrary()],
      );
    const old = cookieToken(request);
    if (old)
      await client.query("DELETE FROM roster_sessions WHERE token_hash=$1", [
        digest(old),
      ]);
    return issue(client, workspaceId, manager ? "manager" : "viewer", "real");
  });
}
