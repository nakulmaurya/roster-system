import { test, expect, Page } from "@playwright/test";
const legacyKey = "datastraw-workspaces-v1";

async function readLibrary(page: Page) {
  const response = await page.request.get("/api/workspace");
  expect(response.ok()).toBe(true);
  return JSON.parse((await response.json()).library);
}
async function settings(page: Page, tab?: string) {
  await page
    .getByRole("button", { name: "Workspace settings", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  if (tab) await dialog.getByRole("button", { name: tab, exact: true }).click();
  return dialog;
}
async function restoreLibrary(page: Page, library: unknown) {
  await page.locator("summary").filter({ hasText: "Export" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Restore JSON backup").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(library)),
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Backup imported" }),
  ).toBeVisible();
}
async function openDemo(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Try the interactive demo", exact: true })
    .click();
  await expect(page.getByLabel("Roster month")).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await openDemo(page);
});

test("weekly view is readable; leap months persist after refresh", async ({
  page,
}) => {
  await expect(page.locator("thead th")).toHaveCount(8);
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await page.getByLabel("Roster month").fill("2028-02");
  await expect(page.locator("thead th")).toHaveCount(30);
  await page.reload();
  await expect(page.getByLabel("Roster month")).toHaveValue("2028-02");
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await page.getByLabel("Roster month").fill("2027-01");
  await expect(page.locator("thead th")).toHaveCount(32);
});

test("different evaluator sessions have isolated database workspaces", async ({
  browser,
  page,
}) => {
  await page.getByLabel("Roster month").fill("2027-05");
  await expect(
    page.getByRole("status").filter({ hasText: "Month opened" }),
  ).toBeVisible();
  const context = await browser.newContext();
  const other = await context.newPage();
  await openDemo(other);
  await expect(other.getByLabel("Roster month")).toHaveValue("2026-11");
  await context.close();
});

test("leave simulation revalidates actual work and is durable", async ({
  page,
}) => {
  const before = (await readLibrary(page)).workspaces.default.dataset;
  const existingLeaveIds = new Set(
    before.leaves.map((leave: { id: string }) => leave.id),
  );
  await page
    .getByRole("button", { name: "Demo scenarios", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Simulate sole-primary sick leave",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Coverage review" }),
  ).toBeVisible();
  const changedDataset = (await readLibrary(page)).workspaces.default.dataset;
  const added = changedDataset.leaves.find(
    (leave: { id: string }) => !existingLeaveIds.has(leave.id),
  );
  expect(added).toBeTruthy();
  expect(
    changedDataset.assignments.some(
      (assignment: {
        employeeId: string;
        brandProcessId: string;
        role: string;
      }) => {
        const service = changedDataset.brandProcesses.find(
          (item: { id: string }) => item.id === assignment.brandProcessId,
        );
        const brand = changedDataset.brands.find(
          (item: { id: string }) => item.id === service?.brandId,
        );
        return (
          assignment.employeeId === added.employeeId &&
          assignment.role === "PRIMARY" &&
          brand?.staffingModel === "SINGLE"
        );
      },
    ),
  ).toBe(true);
  const count = (await readLibrary(page)).workspaces.default.dataset.leaves
    .length;
  expect(count).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByLabel("Roster month")).toBeVisible();
  expect(
    (await readLibrary(page)).workspaces.default.dataset.leaves.length,
  ).toBe(count);
});

test("new employees do not silently receive eligibility", async ({ page }) => {
  const dialog = await settings(page, "Catalog & leads");
  await dialog.getByLabel("Name", { exact: true }).fill("Test New Hire");
  await dialog.getByRole("button", { name: "Add record", exact: true }).click();
  await expect(
    dialog.getByRole("status").filter({ hasText: "Catalog saved" }),
  ).toBeVisible();
  await expect(page.locator("main.main-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const data = (await readLibrary(page)).workspaces.default.dataset;
  const employee = data.employees.find(
    (x: { name: string }) => x.name === "Test New Hire",
  );
  expect(employee).toBeTruthy();
  expect(
    data.assignments.filter(
      (x: { employeeId: string }) => x.employeeId === employee.id,
    ),
  ).toHaveLength(0);
  await dialog
    .getByLabel("Catalog record")
    .selectOption({ label: "Test New Hire" });
  await dialog.getByLabel("Name", { exact: true }).fill("Updated New Hire");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(
    dialog.getByRole("status").filter({ hasText: "Catalog saved" }),
  ).toBeVisible();
  await expect(page.locator("main.main-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect
    .poll(
      async () =>
        (await readLibrary(page)).workspaces.default.dataset.employees.find(
          (x: { id: string }) => x.id === employee.id,
        )?.name,
    )
    .toBe("Updated New Hire");
  await dialog
    .getByRole("button", { name: "Remove record", exact: true })
    .click();
  await expect(
    dialog.getByRole("status").filter({ hasText: "removed" }),
  ).toBeVisible();
  await expect(page.locator("main.main-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(
    (await readLibrary(page)).workspaces.default.dataset.employees.some(
      (x: { id: string }) => x.id === employee.id,
    ),
  ).toBe(false);
});

test("unchanged eligibility save preserves existing Primary authorization", async ({
  page,
}) => {
  const dialog = await settings(page, "Eligibility");
  await expect(dialog.getByLabel("Assignment role")).toHaveValue("PRIMARY");
  await dialog
    .getByRole("button", { name: "Save eligibility", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Eligibility");
  await expect(dialog.getByLabel("Assignment role")).toHaveValue("PRIMARY");
  expect(
    (await readLibrary(page)).workspaces.default.dataset.assignments[0].role,
  ).toBe("PRIMARY");
});

test("JSON restore updates server drafts and survives reload", async ({
  page,
}) => {
  const library = await readLibrary(page);
  library.workspaces.default.dataset.employees[0].name = "Restored Person";
  await restoreLibrary(page, library);
  await page.reload();
  await expect(page.getByLabel("Roster month")).toBeVisible();
  expect(
    (await readLibrary(page)).workspaces.default.dataset.employees[0].name,
  ).toBe("Restored Person");
});

test("process view includes compatible-process bundles", async ({ page }) => {
  await page.getByRole("button", { name: "By process", exact: true }).click();
  await page
    .getByLabel("Process filter")
    .selectOption({ label: "Non-Delivery Report Management" });
  await expect(page.locator("tbody")).toContainText("Apex Athletics");
});

for (const value of ["{invalid-json", "", '{"format":"old-schema"}']) {
  test(`legacy local data is never auto-imported or overwritten: ${value || "empty"}`, async ({
    page,
  }) => {
    await page.evaluate(
      ([key, text]) => localStorage.setItem(key, text),
      [legacyKey, value],
    );
    await page.reload();
    await expect(page.getByLabel("Roster month")).toBeVisible();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), legacyKey),
    ).toBe(value);
    expect(
      (await readLibrary(page)).workspaces.default.dataset.employees,
    ).toHaveLength(30);
  });
}

test("database persistence works when localStorage is unavailable", async ({
  context,
  page,
}) => {
  await context.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("blocked", "QuotaExceededError");
    };
  });
  await page.reload();
  await expect(page.getByLabel("Roster month")).toBeVisible();
  await page.getByLabel("Roster month").fill("2027-03");
  await expect(
    page.getByRole("status").filter({ hasText: "Month opened" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Roster month")).toHaveValue("2027-03");
});

test("keyboard opens and closes a cell dialog with focus restoration", async ({
  page,
}) => {
  const cell = page.getByRole("button", {
    name: /^Edit Apex Athletics,.*2026-11-02$/,
  });
  await cell.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(cell).toBeFocused();
});

test("invalid changes show errors and leave the database revision unchanged", async ({
  page,
}) => {
  const original = await readLibrary(page);
  const dialog = await settings(page, "Holidays");
  await dialog.getByLabel("Holiday name").fill("X".repeat(201));
  await dialog
    .getByRole("button", { name: "Save holiday", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(await readLibrary(page)).toEqual(original);
});

test("a stale tab cannot overwrite a newer database revision", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByLabel("Roster month")).toBeVisible();
  await page.getByLabel("Roster month").fill("2027-01");
  await expect(
    page.getByRole("status").filter({ hasText: "Month opened" }),
  ).toBeVisible();
  await other.getByLabel("Roster month").fill("2027-02");
  await expect(
    other.getByRole("alert").filter({ hasText: "A newer database revision" }),
  ).toBeVisible();
  expect((await readLibrary(page)).workspaces.default.period).toEqual({
    year: 2027,
    month: 1,
  });
  await other
    .getByRole("button", { name: "Load latest changes", exact: true })
    .click();
  await expect(other.getByLabel("Roster month")).toHaveValue("2027-01");
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`mobile layout and dialogs fit ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const trigger = page.getByRole("button", {
      name: "Open navigation",
      exact: true,
    });
    await trigger.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Workspace settings", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Services", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Save service rules", exact: true })
      .scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  });
}

test("configured shift intervals persist through a service save", async ({
  page,
}) => {
  const dialog = await settings(page, "Services");
  await dialog.getByLabel("Shift starts").fill("09:00");
  await dialog.getByLabel("Shift ends").fill("17:00");
  await dialog
    .getByRole("button", { name: "Save service rules", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Service requirements saved",
  );
  const service = (await readLibrary(page)).workspaces.default.dataset
    .brandProcesses[0];
  expect(service.shift).toEqual({
    startMinute: 540,
    endMinute: 1020,
    timezone: "Asia/Kolkata",
  });
});

test("realistic thirty-person roster publishes after explicit backup authorization and preserves history after an edit", async ({
  page,
}) => {
  const initial = (await page.request.get("/api/workspace")).json();
  const state = (await initial).workspace;
  expect(state.dataset.employees).toHaveLength(30);
  expect(state.dataset.brands).toHaveLength(20);
  expect(state.problem.demandSlots.length).toBeGreaterThan(600);
  const gap = state.violations.find(
    (v: { ruleCode: string }) => v.ruleCode === "H4_MINIMUM_COVERAGE",
  );
  expect(gap).toBeTruthy();
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toBeDisabled();
  // Fictional manager explicitly authorizes an existing unused resource; do not
  // lower staffing, erase client services, invent a person, or bypass the audit.
  const backup = state.dataset.employees.find(
    (e: { id: string }) =>
      !state.allocations.some(
        (a: { resourceId: string }) => a.resourceId === e.id,
      ) &&
      !state.problem.unavailabilities.some(
        (u: { resourceId: string; date: string }) =>
          u.resourceId === e.id && u.date === gap.date,
      ),
  );
  expect(backup).toBeTruthy();
  const dialog = await settings(page, "Eligibility");
  await dialog.getByLabel("Manage employee").selectOption(backup.id);
  await dialog
    .getByLabel("Manage brand process")
    .selectOption(gap.affectedServiceIds[0]);
  await dialog.getByLabel("Assignment role").selectOption("BACKUP");
  await dialog
    .getByRole("button", { name: "Save eligibility", exact: true })
    .click();
  await expect(
    dialog.getByRole("status").filter({ hasText: "Eligibility" }),
  ).toBeVisible();
  await expect(page.locator("main.main-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Coverage/ }).click();
  await page
    .getByRole("button", { name: "Fill eligible gaps", exact: true })
    .click();
  await expect(page.locator("main.main-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const publish = page.getByRole("button", { name: "Publish", exact: true });
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(
    page.getByRole("button", { name: "Published", exact: true }),
  ).toBeVisible();
  const published = (await readLibrary(page)).workspaces.default;
  expect(published.status).toBe("PUBLISHED");
  expect(published.publications).toHaveLength(1);
  expect(published.publications[0].dataset.employees).toHaveLength(30);
  expect(published.publications[0].dataset.brandProcesses).toHaveLength(
    state.dataset.brandProcesses.length,
  );
  expect(published.publications[0].allocations.length).toBeGreaterThan(600);
  await page.getByRole("button", { name: "Roster", exact: true }).click();
  await page
    .getByRole("button", { name: /^Edit Apex Athletics,.*2026-11-02$/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Remove / })
    .first()
    .click();
  await expect(page.locator("main.main-content")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const edited = (await readLibrary(page)).workspaces.default;
  expect(edited.status).toBe("DRAFT");
  expect(edited.publications).toEqual(published.publications);
});
