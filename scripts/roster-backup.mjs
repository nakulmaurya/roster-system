// Private local operational backup. Offsite/encrypted replication remains the operator's responsibility.
import { mkdir, chmod, rename, readdir, stat, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
if (!process.env.DATABASE_URL || !process.env.ROSTER_BACKUP_DIR) throw new Error('DATABASE_URL and private ROSTER_BACKUP_DIR required');
const url = new URL(process.env.DATABASE_URL);
if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('PostgreSQL URL required');
const directory = path.resolve(process.env.ROSTER_BACKUP_DIR);
await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700);
const filename = `roster-${new Date().toISOString().replaceAll(':', '-')}.dump`;
const temporary = path.join(directory, `.${filename}.partial`), destination = path.join(directory, filename);
const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: url.searchParams.get('sslmode') ?? 'prefer' };
delete env.DATABASE_URL;
try {
  await new Promise((resolve, reject) => {
    const child = spawn('pg_dump', ['--host', url.hostname, '--port', url.port || '5432', '--username', decodeURIComponent(url.username), '--dbname', decodeURIComponent(url.pathname.slice(1)), '--format=custom', '--no-owner', '--no-acl', '--file', temporary], { env, stdio: ['ignore', 'ignore', 'pipe'] });
    // Do not echo connection details or diagnostic contents into public application logs.
    child.stderr.resume(); child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`pg_dump failed (${code})`)));
  });
  await chmod(temporary, 0o600); await rename(temporary, destination);
} catch (error) { await unlink(temporary).catch(() => {}); throw error; }
for (const name of await readdir(directory)) {
  if (!/^roster-[0-9TZ.:-]+\.dump$/.test(name)) continue;
  const full = path.join(directory, name);
  if (Date.now() - (await stat(full)).mtimeMs > 7 * 86400000) await unlink(full);
}
console.log(`PostgreSQL backup completed: ${filename}. Local retention: seven days.`);
