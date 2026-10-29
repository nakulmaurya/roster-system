import { afterEach, expect, it, vi } from "vitest";
import { database, closeDatabase } from "./db";

afterEach(async () => {
  await closeDatabase();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("handles idle database errors without crashing or leaking connection details", () => {
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://fixture:unused@127.0.0.1:1/roster_test",
  );
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const pool = database();
  expect(pool.listenerCount("error")).toBeGreaterThan(0);
  expect(() =>
    pool.emit("error", new Error("sensitive connection diagnostic")),
  ).not.toThrow();
  expect(log).toHaveBeenCalledWith("Roster database pool recovery", "Error");
  expect(JSON.stringify(log.mock.calls)).not.toContain(
    "sensitive connection diagnostic",
  );
});
