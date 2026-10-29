// Explicit application-process restart probe. Keep the fixture private (it contains a demo session).
// ROSTER_PROBE_ORIGIN=http://127.0.0.1:3400 node scripts/roster-persistence-probe.mjs write /private/probe.json
// Restart the application process, then run the same command with `read`.
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const [mode,path]=process.argv.slice(2);
if (!['write','read'].includes(mode) || !path) throw new Error('Usage: node scripts/roster-persistence-probe.mjs write|read /private/probe.json');
const origin=process.env.ROSTER_PROBE_ORIGIN;
if (!origin) throw new Error('ROSTER_PROBE_ORIGIN required');
async function call(route,method='GET',body,cookie,csrf) {
  const res=await fetch(`${origin}/api/${route}`,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  assert.equal(res.status,200,`Unexpected HTTP ${res.status}: ${await res.clone().text()}`);
  return {body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
}
if(mode==='write') {
  const demo=await call('demo','POST',{});
  const current=await call('workspace','GET',undefined,demo.cookie);
  const library=JSON.parse(current.body.library);const sentinel=`Fictional restart probe ${randomUUID()}`;
  library.workspaces.default.dataset.employees[0].name=sentinel;
  const saved=await call('workspace','POST',{type:'commit',revision:current.body.revision,library:JSON.stringify(library)},demo.cookie,demo.body.csrfToken);
  await writeFile(path,JSON.stringify({cookie:demo.cookie,sentinel,revision:saved.body.revision}),{mode:0o600});
  console.log('Restart probe write acknowledged by PostgreSQL. Restart application, then run read.');
} else {
  const fixture=JSON.parse(await readFile(path,'utf8'));
  const current=await call('workspace','GET',undefined,fixture.cookie);
  assert.equal(current.body.revision,fixture.revision);
  assert.equal(current.body.workspace.dataset.employees[0].name,fixture.sentinel);
  console.log('Restart probe passed: server session, revision and saved data survived application restart.');
}
