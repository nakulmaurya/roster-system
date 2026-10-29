// Read password from stdin, not argv/history. Output only the salted hash.
import { randomBytes, scryptSync } from 'node:crypto';
let password = '';
for await (const chunk of process.stdin) password += chunk;
password = password.replace(/\r?\n$/,'');
if (password.length < 12 || password.length > 1024) throw new Error('Use a 12–1024 character password.');
const salt = randomBytes(16);
console.log(`scrypt$${salt.toString('hex')}$${scryptSync(password,salt,64).toString('hex')}`);
