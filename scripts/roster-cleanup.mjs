import pg from 'pg';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const client = new pg.Client({connectionString:process.env.DATABASE_URL});
try {
  await client.connect(); await client.query('BEGIN');
  const result = await client.query("DELETE FROM roster_workspaces WHERE id IN (SELECT id FROM roster_workspaces WHERE kind='demo' AND expires_at<now() ORDER BY expires_at LIMIT 100)");
  await client.query('DELETE FROM roster_sessions WHERE expires_at<now()');
  await client.query("DELETE FROM roster_rate_events WHERE occurred_at<now()-interval '1 hour'");
  await client.query('COMMIT'); console.log(`Removed ${result.rowCount} expired demos.`);
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { await client.end(); }
