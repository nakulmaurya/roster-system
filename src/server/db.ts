import { Pool, PoolClient } from "pg";

// A connection pool, never a workspace/state cache. Each operation reads PostgreSQL.
let pool: Pool | undefined;
export function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 8,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 15000,
      application_name: "roster-server",
    });
    // pg emits idle-client errors during a DB restart. Handle them without an
    // unhandled EventEmitter crash; pg removes the dead client and reconnects.
    // Never print error messages containing SQL or connection details.
    pool.on("error", (error) =>
      console.error("Roster database pool recovery", error.name),
    );
  }
  return pool;
}
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function closeDatabase() {
  if (pool) await pool.end();
  pool = undefined;
}
