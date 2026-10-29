import pg from 'pg';
import { readFile } from 'node:fs/promises';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const client = new pg.Client({connectionString:process.env.DATABASE_URL});
try {
  await client.connect();
  await client.query(await readFile(new URL('../migrations/001_central_workspace.sql',import.meta.url),'utf8'));
  console.log('Central PostgreSQL migration applied.');
} finally { await client.end(); }
