import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 30000 });
import { randomBytes, scryptSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  GET as sessionGet,
  POST as login,
  DELETE as logout,
} from "@/app/api/session/route";
import { POST as demo } from "@/app/api/demo/route";
import { GET as read, POST as write } from "@/app/api/workspace/route";
import { closeDatabase, database } from "./db";
import { applyProposal, Library } from "./bridge";
import { cookie } from "./auth";

// Dedicated real PostgreSQL only. Never silently emulate persistence.
const enabled = Boolean(process.env.TEST_DATABASE_URL);
if (enabled) {
  const databaseName = new URL(process.env.TEST_DATABASE_URL!).pathname.slice(
    1,
  );
  if (!/(^|[_-])(test|ci)([_-]|$)/i.test(databaseName))
    throw new Error(
      "Refusing destructive integration tests: database name must explicitly contain test or ci.",
    );
}
const origin = "http://127.0.0.1:3400";
interface Identity {
  cookie: string;
  csrf: string;
}
let manager: Identity, viewer: Identity, demoA: Identity, demoB: Identity;
function req(
  path: string,
  method = "GET",
  body?: unknown,
  identity?: Identity,
  extra: Record<string, string> = {},
) {
  return new Request(`${origin}/api/${path}`, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(identity
        ? { Cookie: identity.cookie, "X-CSRF-Token": identity.csrf }
        : {}),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function identity(response: Response): Promise<Identity> {
  expect(response.status, await response.clone().text()).toBe(200);
  const data = await response.json();
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  expect(cookie).toBeTruthy();
  return { cookie: cookie!, csrf: data.csrfToken };
}
async function snapshot(who: Identity) {
  const response = await read(req("workspace", "GET", undefined, who));
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json();
}
async function commit(
  who: Identity,
  revision: number,
  library: Library,
  publish = false,
) {
  return write(
    req(
      "workspace",
      "POST",
      { type: "commit", revision, library: JSON.stringify(library), publish },
      who,
    ),
  );
}
function parse(value: { library: string }) {
  return JSON.parse(value.library) as Library;
}

// Small feasible month used to exercise server publication, independently from UI seed gaps.
function makeFeasible(library: Library) {
  const doc = library.workspaces.default;
  doc.dataset.assignments = [];
  doc.dataset.brandProcesses = [];
  doc.allocations = [];
  doc.baselineAllocations = [];
  return library;
}

describe.skipIf(!enabled)(
  "central PostgreSQL API security and persistence",
  () => {
    beforeAll(async () => {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      process.env.APP_ORIGIN = origin;
      process.env.ROSTER_ADMIN_USERNAME = "integration-manager";
      process.env.ROSTER_VIEWER_USERNAME = "integration-viewer";
      const salt = randomBytes(16);
      const password = "fictional-test-password";
      const hash = `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;
      process.env.ROSTER_ADMIN_PASSWORD_HASH = hash;
      process.env.ROSTER_VIEWER_PASSWORD_HASH = hash;
      process.env.ROSTER_REAL_WORKSPACE_ID =
        "00000000-0000-4000-8000-000000000099";
      process.env.DEMO_RATE_PER_10_MIN = "200";
      process.env.DEMO_MAX_WORKSPACES = "1000";
      await database().query(
        await readFile("migrations/001_central_workspace.sql", "utf8"),
      );
      // Destructive reset is explicit and guarded by TEST_DATABASE_URL. Dedicated test DB only.
      await database().query(
        "TRUNCATE roster_publications,roster_sessions,roster_workspaces,roster_rate_events",
      );
      manager = await identity(
        await login(
          req("session", "POST", { username: "integration-manager", password }),
        ),
      );
      viewer = await identity(
        await login(
          req("session", "POST", { username: "integration-viewer", password }),
        ),
      );
      demoA = await identity(await demo(req("demo", "POST", {})));
      demoB = await identity(await demo(req("demo", "POST", {})));
    }, 30000);
    afterAll(async () => {
      await closeDatabase();
    });
    it("rejects unauthenticated access and does not provision from reads", async () => {
      expect((await read(req("workspace"))).status).toBe(401);
      expect(
        (
          await write(
            req("workspace", "POST", { type: "publish", revision: 0 }),
          )
        ).status,
      ).toBe(401);
      expect(await (await sessionGet(req("session"))).json()).toEqual({
        authenticated: false,
      });
    });
    it("sets HttpOnly SameSite cookies; production HTTPS is Secure", async () => {
      const response = await demo(req("demo", "POST", {}));
      const cookie = response.headers.get("set-cookie")!;
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Path=/");
    });
    it("viewer can read but write/publish fail on server", async () => {
      const data = await snapshot(viewer);
      expect((await commit(viewer, data.revision, parse(data))).status).toBe(
        403,
      );
      expect(
        (
          await write(
            req(
              "workspace",
              "POST",
              { type: "publish", revision: data.revision },
              viewer,
            ),
          )
        ).status,
      ).toBe(403);
    });
    it("fails closed on foreign/missing origin and invalid CSRF", async () => {
      expect(
        (
          await demo(
            req("demo", "POST", {}, undefined, {
              Origin: "https://evil.example",
            }),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await demo(
            new Request(`${origin}/api/demo`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            }),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await write(
            req(
              "workspace",
              "POST",
              { type: "publish", revision: 0 },
              manager,
              { "X-CSRF-Token": "wrong" },
            ),
          )
        ).status,
      ).toBe(403);
    });
    it("bounds stream bodies even without Content-Length; malformed JSON and errors are safe", async () => {
      const tooBig = new Request(`${origin}/api/workspace`, {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: manager.cookie,
          "X-CSRF-Token": manager.csrf,
        },
        body: " ".repeat(2_000_001),
      });
      expect((await write(tooBig)).status).toBe(413);
      const bad = new Request(`${origin}/api/workspace`, {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: manager.cookie,
          "X-CSRF-Token": manager.csrf,
        },
        body: "{",
      });
      expect((await write(bad)).status).toBe(400);
    });
    it("commits under DB revision CAS and rejects stale writes", async () => {
      const base = await snapshot(demoA);
      const library = parse(base);
      library.workspaces.default.dataset.employees[0].name =
        "Fictional revision test";
      const first = await commit(demoA, base.revision, library);
      expect(first.status, await first.clone().text()).toBe(200);
      expect((await first.json()).revision).toBe(base.revision + 1);
      expect((await commit(demoA, base.revision, library)).status).toBe(409);
    });
    it("serializes concurrent writers: exactly one succeeds", async () => {
      const base = await snapshot(demoA);
      const library = parse(base);
      const statuses = await Promise.all([
        commit(demoA, base.revision, library),
        commit(demoA, base.revision, library),
      ]);
      expect(statuses.map((x) => x.status).sort()).toEqual([200, 409]);
    });
    it("isolates independent demos and the real workspace, ignoring client scope injection", async () => {
      const a = await snapshot(demoA),
        b = await snapshot(demoB),
        real = await snapshot(manager);
      expect(parse(a).workspaces.default.dataset.employees[0].name).toBe(
        "Fictional revision test",
      );
      expect(parse(b).workspaces.default.dataset.employees[0].name).not.toBe(
        "Fictional revision test",
      );
      expect(parse(real).workspaces.default.dataset.employees[0].name).not.toBe(
        "Fictional revision test",
      );
      expect(
        (
          await write(
            req(
              "workspace",
              "POST",
              {
                type: "publish",
                revision: a.revision,
                workspaceId: process.env.ROSTER_REAL_WORKSPACE_ID,
              },
              demoA,
            ),
          )
        ).status,
      ).toBe(422);
    });
    it("never trusts client publication flags; independently blocks invalid publish", async () => {
      let base = await snapshot(demoA);
      let library = parse(base);
      library.workspaces.default.status = "PUBLISHED";
      library.workspaces.default.publishedAt = "2020-01-01T00:00:00.000Z";
      const res = await commit(demoA, base.revision, library);
      expect(res.status, await res.clone().text()).toBe(200);
      expect((await res.json()).workspace.status).toBe("DRAFT");
      base = await snapshot(demoA);
      library = parse(base);
      library.workspaces.default.allocations = [];
      const fail = await commit(demoA, base.revision, library, true);
      expect(fail.status).toBe(422);
      expect((await fail.json()).error).toBe("PUBLICATION_BLOCKED");
      expect((await snapshot(demoA)).revision).toBe(base.revision); // full rollback
    });
    it("publishes with server audit/timestamp; rejects history edits and preserves snapshots across edits", async () => {
      let base = await snapshot(demoB);
      let library = makeFeasible(parse(base));
      const published = await commit(demoB, base.revision, library, true);
      expect(published.status, await published.clone().text()).toBe(200);
      const data = await published.json();
      expect(data.workspace.status).toBe("PUBLISHED");
      expect(data.workspace.publications).toHaveLength(1);
      const before = data.workspace.publications[0];
      base = await snapshot(demoB);
      library = parse(base);
      library.workspaces.default.publications[0].publishedAt =
        "2000-01-01T00:00:00.000Z";
      expect((await commit(demoB, base.revision, library)).status).toBe(422);
      library = parse(base);
      library.workspaces.default.publications = [];
      expect((await commit(demoB, base.revision, library)).status).toBe(422);
      library = parse(base);
      library.workspaces.default.dataset.employees[0].name =
        "New fictional draft";
      const edited = await commit(demoB, base.revision, library);
      expect(edited.status, await edited.clone().text()).toBe(200);
      const updated = await edited.json();
      expect(updated.workspace.status).toBe("DRAFT");
      expect(updated.workspace.version).toBeGreaterThan(before.version);
      expect(updated.workspace.publications[0]).toEqual(before);
      const stored = await database().query(
        "SELECT snapshot FROM roster_publications WHERE period=$1",
        [
          `${before.period.year}-${String(before.period.month).padStart(2, "0")}`,
        ],
      );
      expect(
        stored.rows.some((x) => x.snapshot.publishedAt === before.publishedAt),
      ).toBe(true);
      await expect(
        database().query("UPDATE roster_publications SET version=version+10"),
      ).rejects.toThrow("immutable");
      await expect(
        database().query("DELETE FROM roster_publications"),
      ).rejects.toThrow("immutable");
    });
    it("does not downgrade unchanged publication due to PostgreSQL JSONB key order", async () => {
      const base = await snapshot(demoB);
      const published = await write(
        req(
          "workspace",
          "POST",
          { type: "publish", revision: base.revision },
          demoB,
        ),
      );
      expect(published.status, await published.clone().text()).toBe(200);
      const latest = await snapshot(demoB);
      const noOp = await commit(demoB, latest.revision, parse(latest));
      expect(noOp.status, await noOp.clone().text()).toBe(200);
      expect((await noOp.json()).workspace.status).toBe("PUBLISHED");
    });
    it("retains database state and sessions across a connection-pool restart", async () => {
      const before = await snapshot(demoA);
      await closeDatabase();
      const after = await snapshot(demoA);
      expect(after.revision).toBe(before.revision);
      expect(after.workspace).toEqual(before.workspace);
    });
    it("rotation/logout revokes server-side session and expiry rejects access", async () => {
      const isolated = await identity(await demo(req("demo", "POST", {})));
      expect(
        (await logout(req("session", "DELETE", undefined, isolated))).status,
      ).toBe(200);
      expect(
        (await read(req("workspace", "GET", undefined, isolated))).status,
      ).toBe(401);
      const expiring = await identity(await demo(req("demo", "POST", {})));
      const token = expiring.cookie.split("=")[1];
      const { digest } = await import("./auth");
      await database().query(
        "UPDATE roster_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
        [digest(token)],
      );
      expect(
        (await read(req("workspace", "GET", undefined, expiring))).status,
      ).toBe(401);
    });
    it("demo reuse does not allocate extra workspaces; cap/rate fail closed", async () => {
      const count = async () =>
        Number(
          (
            await database().query(
              "SELECT count(*) FROM roster_workspaces WHERE kind='demo'",
            )
          ).rows[0].count,
        );
      const before = await count();
      expect((await demo(req("demo", "POST", {}, demoA))).status).toBe(200);
      expect(await count()).toBe(before);
      process.env.DEMO_MAX_WORKSPACES = "1";
      expect((await demo(req("demo", "POST", {}))).status).toBe(429);
      process.env.DEMO_MAX_WORKSPACES = "1000";
      process.env.DEMO_RATE_PER_10_MIN = "1";
      expect((await demo(req("demo", "POST", {}))).status).toBe(429);
      process.env.DEMO_RATE_PER_10_MIN = "200";
    });
    it("cleans expired demo publications safely via FK cascade; never real workspaces", async () => {
      const { digest } = await import("./auth");
      const token = demoB.cookie.split("=")[1];
      const { rows } = await database().query(
        "SELECT workspace_id FROM roster_sessions WHERE token_hash=$1",
        [digest(token)],
      );
      const id = rows[0].workspace_id;
      expect(
        Number(
          (
            await database().query(
              "SELECT count(*) FROM roster_publications WHERE workspace_id=$1",
              [id],
            )
          ).rows[0].count,
        ),
      ).toBeGreaterThan(0);
      await database().query(
        "UPDATE roster_workspaces SET expires_at=now()-interval '1 second' WHERE id=$1",
        [id],
      );
      const fresh = await demo(req("demo", "POST", {}));
      expect(fresh.status, await fresh.clone().text()).toBe(200);
      expect(
        (
          await database().query(
            "SELECT id FROM roster_workspaces WHERE id=$1",
            [id],
          )
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await database().query(
            "SELECT version FROM roster_publications WHERE workspace_id=$1",
            [id],
          )
        ).rowCount,
      ).toBe(0);
      expect((await snapshot(manager)).kind).toBe("real");
    });
  },
);

describe("server policy unit checks", () => {
  it("always uses secure cookies in public production; loopback override cannot weaken public host", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ORIGIN", "https://public.example");
    vi.stubEnv("ALLOW_INSECURE_LOCALHOST", "true");
    expect(cookie("test", 60)).toContain("; Secure");
    vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3400");
    vi.stubEnv("SESSION_COOKIE_SECURE", "false");
    expect(cookie("test", 60)).not.toContain("; Secure");
    vi.unstubAllEnvs();
  });
  it("preflights publication100 cap and rejects101 without changing history", () => {
    const dataset = {
      pods: [],
      employees: [],
      processes: [],
      calendars: [],
      publicHolidays: [],
      brands: [],
      brandProcesses: [],
      assignments: [],
      leaves: [],
    };
    const solverConfig = {
      maxConsecutiveDays: 6,
      enforcePodAffinity: true,
      honorPreferredOffDay: true,
      preferPrimaryContinuity: true,
    };
    const period = { year: 2026, month: 11 };
    const publications = Array.from({ length: 100 }, (_, i) => ({
      version: i + 1,
      publishedAt: "2026-10-29T00:00:00.000Z",
      period,
      dataset,
      solverConfig,
      allocations: [],
    }));
    const library: Library = {
      format: "datastraw-workspaces",
      schemaVersion: 1,
      workspaces: {
        default: {
          period,
          dataset,
          solverConfig,
          allocations: [],
          baselineAllocations: [],
          publications,
          status: "DRAFT",
          version: 101,
        },
      },
    };
    const before = JSON.stringify(library);
    expect(() =>
      applyProposal(library, structuredClone(library), true),
    ).toThrow("limit of 100 publications");
    expect(JSON.stringify(library)).toBe(before);
    const reopened = structuredClone(library);
    reopened.workspaces.default.status = "PUBLISHED";
    reopened.workspaces.default.version = 100;
    // Import independently downgrades an invalid/stale publication claim before the cap check.
    expect(() =>
      applyProposal(reopened, structuredClone(reopened), true),
    ).toThrow("limit of 100 publications");
    expect(
      applyProposal(library, structuredClone(library), false).workspace
        .publications,
    ).toHaveLength(100);
  });
});
