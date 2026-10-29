/** Independent v0.4 API + fresh-context smoke. Run against an isolated assessment server.
 * PLAYWRIGHT_BASE_URL and (if different) ASSESSMENT_APP_ORIGIN select the server.
 * Optional ASSESSMENT_VIEWER_USERNAME/PASSWORD enable real read-only role verification.
 * Never points at personnel data by default; demo API creates fictional isolated DB rows.
 */
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

type Document = {
  period: { year: number; month: number };
  status: string;
  version: number;
  publishedAt?: string;
  dataset: {
    employees: { id: string; name: string }[];
    leaves: unknown[];
    brandProcesses: {
      id: string;
      minStaffing: number;
      staffingOverrides?: { date: string; minStaffing: number }[];
      shift?: unknown;
    }[];
    assignments: { employeeId: string; brandProcessId: string }[];
  };
  allocations: unknown[];
  baselineAllocations: unknown[];
  publications: Record<string, unknown>[];
};
type Library = { workspaces: Record<string, Document> };
type Snapshot = {
  revision: number;
  library: string;
  role: string;
  kind: string;
  workspace: {
    status: string;
    publications: Record<string, unknown>[];
    problem: {
      demandSlots: {
        id: string;
        serviceId: string;
        date: string;
        capacityWeightPerResource: number;
      }[];
    };
  };
};
const origin =
  process.env.ASSESSMENT_APP_ORIGIN ??
  new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000").origin;
const headers = (csrf?: string) => ({
  Origin: origin,
  ...(csrf ? { "X-CSRF-Token": csrf } : {}),
});
async function read(request: APIRequestContext): Promise<Snapshot> {
  const response = await request.get("/api/workspace");
  expect(response.status(), await response.text()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  return response.json();
}
async function demo(request: APIRequestContext): Promise<string> {
  const response = await request.post("/api/demo", {
    headers: headers(),
    data: {},
  });
  expect(response.status(), await response.text()).toBe(200);
  const session = await response.json();
  expect(session).toMatchObject({
    authenticated: true,
    role: "manager",
    kind: "demo",
  });
  expect(session.csrfToken).toEqual(expect.any(String));
  return session.csrfToken;
}
async function commit(
  request: APIRequestContext,
  csrf: string,
  state: Snapshot,
  library: Library,
) {
  return request.post("/api/workspace", {
    headers: headers(csrf),
    data: {
      type: "commit",
      revision: state.revision,
      library: JSON.stringify(library),
    },
  });
}
function rename(state: Snapshot, name: string): Library {
  const library: Library = JSON.parse(state.library);
  library.workspaces.default.dataset.employees[0].name = name;
  return library;
}
async function enterDemo(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Try the interactive demo", exact: true })
    .click();
  await expect(page.getByLabel("Roster month")).toBeVisible();
}

test("API unauthenticated requests never read or mutate a workspace", async ({
  request,
}) => {
  const session = await request.get("/api/session");
  expect(session.status()).toBe(200);
  expect(await session.json()).toEqual({ authenticated: false });
  expect((await request.get("/api/workspace")).status()).toBe(401);
  expect(
    (
      await request.post("/api/workspace", {
        headers: headers(),
        data: { type: "publish", revision: 0 },
      })
    ).status(),
  ).toBe(401);
});

test("demo session cookie is HTTPOnly and logout revokes its API authority", async ({
  request,
}) => {
  const csrf = await demo(request);
  const cookies = (await request.storageState()).cookies;
  const session = cookies.find((cookie) => cookie.name === "roster_session");
  expect(session).toBeDefined();
  expect(session!.httpOnly).toBe(true);
  expect(session!.sameSite).toBe("Lax");
  const state = await read(request);
  const response = await request.delete("/api/session", {
    headers: headers(csrf),
  });
  expect(response.status()).toBe(200);
  expect((await request.get("/api/workspace")).status()).toBe(401);
  expect(
    (
      await request.post("/api/workspace", {
        headers: headers(csrf),
        data: { type: "publish", revision: state.revision },
      })
    ).status(),
  ).toBe(401);
});

test("CSRF, missing origin and foreign origin fail without any committed change", async ({
  request,
}) => {
  const csrf = await demo(request);
  const before = await read(request);
  const command = {
    type: "commit",
    revision: before.revision,
    library: JSON.stringify(rename(before, "Must not persist")),
  };
  for (const suppliedHeaders of [
    headers(),
    headers("invalid-token"),
    { "X-CSRF-Token": csrf },
    { Origin: "https://attacker.invalid", "X-CSRF-Token": csrf },
  ]) {
    const response = await request.post("/api/workspace", {
      headers: suppliedHeaders,
      data: command,
    });
    expect(response.status(), await response.text()).toBe(403);
    expect(await read(request)).toEqual(before);
  }
});

test("two simultaneous valid writes at one revision have exactly one winner", async ({
  request,
}) => {
  const csrf = await demo(request);
  const before = await read(request);
  const responses = await Promise.all(
    ["Concurrent QA A", "Concurrent QA B"].map((name) =>
      commit(request, csrf, before, rename(before, name)),
    ),
  );
  expect(responses.map((response) => response.status()).sort()).toEqual([
    200, 409,
  ]);
  const winner = (await responses
    .find((response) => response.status() === 200)!
    .json()) as Snapshot;
  const actual = await read(request);
  expect(actual.revision).toBe(before.revision + 1);
  expect(JSON.parse(actual.library)).toEqual(JSON.parse(winner.library));
  const stale = await commit(
    request,
    csrf,
    before,
    rename(before, "Stale overwrite"),
  );
  expect(stale.status()).toBe(409);
  expect(await read(request)).toEqual(actual);
});

test("client publication flags cannot publish uncovered work; failed publish is atomic", async ({
  request,
}) => {
  const csrf = await demo(request);
  let before = await read(request);
  const library: Library = JSON.parse(before.library);
  const doc = library.workspaces.default;
  doc.allocations = [];
  doc.status = "PUBLISHED";
  doc.publishedAt = "2000-01-01T00:00:00Z";
  // Client-authored diagnostics, including an empty list, are not publication authority.
  Object.assign(doc, {
    violations: [],
    coverageRate: 1,
    fulfilledSlots: 999999,
  });
  const forged = await commit(request, csrf, before, library);
  expect(forged.status(), await forged.text()).toBe(200);
  before = await read(request);
  expect(before.workspace.status).toBe("DRAFT");
  expect(before.workspace.publications).toHaveLength(0);
  const publication = await request.post("/api/workspace", {
    headers: headers(csrf),
    data: { type: "publish", revision: before.revision },
  });
  expect(publication.status(), await publication.text()).toBe(422);
  expect(await read(request)).toEqual(before);
});

test("server creates publication history, rejects history tampering, and preserves snapshot after edits", async ({
  request,
}) => {
  const csrf = await demo(request);
  let state = await read(request);
  let library: Library = JSON.parse(state.library);
  const doc = library.workspaces.default;
  // Small non-vacuous one-seat assessment fixture, with explicit eligible employee.
  doc.dataset.leaves = [];
  doc.allocations = [];
  doc.baselineAllocations = [];
  const service = doc.dataset.brandProcesses[0];
  for (const requirement of doc.dataset.brandProcesses) {
    requirement.minStaffing = 0;
    requirement.staffingOverrides = [];
  }
  service.staffingOverrides = [{ date: "2026-11-02", minStaffing: 1 }];
  service.shift = {
    startMinute: 480,
    endMinute: 540,
    timezone: "Asia/Kolkata",
  };
  let response = await commit(request, csrf, state, library);
  expect(response.status(), await response.text()).toBe(200);
  state = await read(request);
  library = JSON.parse(state.library);
  const demand = state.workspace.problem.demandSlots.find(
    (slot) => slot.serviceId === service.id && slot.date === "2026-11-02",
  );
  expect(demand).toBeDefined();
  const eligible = library.workspaces.default.dataset.assignments.find(
    (assignment) => assignment.brandProcessId === service.id,
  );
  expect(eligible).toBeDefined();
  library.workspaces.default.allocations = [
    {
      id: "independent-qa-seat",
      slotId: demand!.id,
      serviceId: demand!.serviceId,
      date: demand!.date,
      resourceId: eligible!.employeeId,
      capacityConsumed: demand!.capacityWeightPerResource,
      isLocked: false,
      source: "MANUAL_EDIT",
    },
  ];
  response = await commit(request, csrf, state, library);
  expect(response.status(), await response.text()).toBe(200);
  state = await read(request);
  const started = Date.now();
  response = await request.post("/api/workspace", {
    headers: headers(csrf),
    data: { type: "publish", revision: state.revision },
  });
  expect(response.status(), await response.text()).toBe(200);
  state = await read(request);
  library = JSON.parse(state.library);
  const published = library.workspaces.default.publications;
  expect(state.workspace.status).toBe("PUBLISHED");
  expect(published).toHaveLength(1);
  expect(published[0].allocations).toHaveLength(1);
  expect(Date.parse(published[0].publishedAt as string)).toBeGreaterThanOrEqual(
    started - 5000,
  );
  for (const operation of ["delete", "timestamp", "allocation", "insert"]) {
    const tampered: Library = JSON.parse(state.library);
    const history = tampered.workspaces.default.publications;
    if (operation === "delete") history.length = 0;
    if (operation === "timestamp")
      history[0].publishedAt = "2000-01-01T00:00:00Z";
    if (operation === "allocation") history[0].allocations = [];
    if (operation === "insert") {
      const extra = structuredClone(history[0]);
      extra.version = Number(extra.version) + 1;
      history.push(extra);
    }
    response = await commit(request, csrf, state, tampered);
    expect(response.status(), `${operation}: ${await response.text()}`).toBe(
      422,
    );
    expect(await read(request)).toEqual(state);
  }
  response = await commit(
    request,
    csrf,
    state,
    rename(state, "Edited after publication"),
  );
  expect(response.status(), await response.text()).toBe(200);
  const edited = await read(request);
  const editedDoc = (JSON.parse(edited.library) as Library).workspaces.default;
  expect(editedDoc.status).toBe("DRAFT");
  expect(editedDoc.publications).toEqual(published);
  expect(editedDoc.version).toBeGreaterThan(Number(published[0].version));
});

test("malformed commits fail atomically and do not leak internal errors", async ({
  request,
}) => {
  const csrf = await demo(request);
  const before = await read(request);
  for (const library of [
    "{invalid",
    "{}",
    JSON.stringify({ ...JSON.parse(before.library), workspaces: {} }),
  ]) {
    const response = await request.post("/api/workspace", {
      headers: headers(csrf),
      data: { type: "commit", revision: before.revision, library },
    });
    expect(response.status(), await response.text()).toBe(422);
    expect(await response.text()).not.toMatch(
      /postgres(?:ql)?:\/\/|SELECT .* FROM|password_hash|node_modules|at .*\.ts:/i,
    );
    expect(await read(request)).toEqual(before);
  }
});

test("fresh browser demo contexts are isolated and survive reload without localStorage authority", async ({
  browser,
}) => {
  const one = await browser.newContext();
  const two = await browser.newContext();
  try {
    const first = await one.newPage();
    const second = await two.newPage();
    await enterDemo(first);
    await enterDemo(second);
    const initialSecond = await read(two.request);
    const session = await (await one.request.get("/api/session")).json();
    const initialFirst = await read(one.request);
    const response = await commit(
      one.request,
      session.csrfToken,
      initialFirst,
      rename(initialFirst, "Only in isolated demo A"),
    );
    expect(response.status(), await response.text()).toBe(200);
    await first.reload();
    await expect(first.getByLabel("Roster month")).toBeVisible();
    expect(
      JSON.parse((await read(one.request)).library).workspaces.default.dataset
        .employees[0].name,
    ).toBe("Only in isolated demo A");
    expect(await read(two.request)).toEqual(initialSecond);
    await first.evaluate(() =>
      localStorage.setItem("datastraw-workspaces-v1", "{invalid legacy data"),
    );
    await first.reload();
    await expect(first.getByLabel("Roster month")).toBeVisible();
    expect(
      JSON.parse((await read(one.request)).library).workspaces.default.dataset
        .employees[0].name,
    ).toBe("Only in isolated demo A");
  } finally {
    await one.close();
    await two.close();
  }
});

test("real viewer can read but cannot commit or publish", async ({
  request,
}) => {
  test.skip(
    !process.env.ASSESSMENT_VIEWER_USERNAME ||
      !process.env.ASSESSMENT_VIEWER_PASSWORD,
    "Pending: isolated real viewer credentials not supplied; no role verification claimed.",
  );
  const login = await request.post("/api/session", {
    headers: headers(),
    data: {
      username: process.env.ASSESSMENT_VIEWER_USERNAME,
      password: process.env.ASSESSMENT_VIEWER_PASSWORD,
    },
  });
  expect(login.status(), await login.text()).toBe(200);
  const session = await login.json();
  expect(session.role).toBe("viewer");
  expect(session.kind).toBe("real");
  const before = await read(request);
  expect(
    (
      await commit(
        request,
        session.csrfToken,
        before,
        rename(before, "Viewer must not change"),
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/workspace", {
        headers: headers(session.csrfToken),
        data: { type: "publish", revision: before.revision },
      })
    ).status(),
  ).toBe(403);
  expect(await read(request)).toEqual(before);
});
