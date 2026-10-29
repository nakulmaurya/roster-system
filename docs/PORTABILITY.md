# Windows and Linux setup

## Verification scope

| Platform    | Evidence                                                                                                                                                                  | Not claimed                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Linux x64   | Existing actual Node24/PostgreSQL17 application build, tests, deployment and browser verification; dependency-resolution dry run also passed                              | No guarantee for every Linux distribution or machine                                               |
| Windows x64 | Lockfile includes Windows native packages for Next/SWC, Sharp and Lightning CSS; `npm ci --dry-run --ignore-scripts --os=win32 --cpu=x64` passed in an isolated directory | No Windows executable, install script, build, database or browser test was actually run on Windows |

There is no observed Windows-specific dependency conflict in the resolution check. That is not a Windows runtime certification. Use the live browser demo if you only need to evaluate the application.

## Prerequisites

- **Node.js24 LTS**, npm and **PostgreSQL17**. Node24 is the validated runtime; `engines`, `.nvmrc` and `.node-version` now agree. Avoid unsupported/odd Node major versions.
- A reachable database and a role with permission to apply the supplied SQL migration.
- An exact `APP_ORIGIN`, initially `http://localhost:3000` in the template. Use that same hostname and port in the browser and any browser-test base URL.
- Install from the committed lockfile with `npm ci`. Do not copy a Linux `node_modules` directory onto Windows or vice versa.

## Linux / Bash

```bash
npm ci
cp .env.example .env.local
# Edit .env.local: set DATABASE_URL for your own database and exact APP_ORIGIN.
node --env-file=.env.local scripts/roster-migrate.mjs
npm run dev
```

Open `http://localhost:3000` if using the template origin. Next.js reads `.env.local` automatically; the standalone migration script needs the explicit `--env-file` flag.

## Windows / PowerShell

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
# Edit .env.local with your database credentials and APP_ORIGIN.
node --env-file=.env.local scripts/roster-migrate.mjs
npm.cmd run dev
```

`npm.cmd` avoids dependence on PowerShell allowing the `npm.ps1` wrapper; disabling machine-wide execution policies is unnecessary. Install the matching Windows versions of Node/PostgreSQL, not Linux binaries.

Browser tests, in a separate PowerShell window with the application ready:

```powershell
npx.cmd playwright install chromium
$env:PLAYWRIGHT_BASE_URL = "http://localhost:3000"
npm.cmd run test:e2e
```

These are documented PowerShell equivalents, not claims of a Windows test execution. Actual PostgreSQL integration and real viewer cases additionally need the dedicated test database/private fixture variables documented elsewhere. Never point destructive tests at production.

## Optional components

- `deploy/systemd/` targets Linux service hosting only. It is not required to run the app on Windows.
- The optional database-backup script needs PostgreSQL's `pg_dump` in `PATH`; on Windows that is normally in the PostgreSQL `bin` directory. Backups are not invoked by app startup.
- Chromium is needed for Playwright browser tests, not for serving the app.
- Kokoro, Python, ONNX and FFmpeg are optional offline narration tools. **None is a dependency of the roster application.** The included video is already generated. The narration environment/lockfile was tested on Linux; Windows Python wheels/native dependencies were not validated.
- Linux `taskset`, `nice`, shell inline environment assignments and systemd commands are not PowerShell commands. Use the Windows equivalents above; omit Linux resource-affinity commands when using narration elsewhere.

## Local production mode

`npm run build` then `npm start` runs production mode. Secure cookies require HTTPS unless the operator explicitly sets `ALLOW_INSECURE_LOCALHOST=true` for a loopback-only HTTP test. Never weaken a public origin to fix a local configuration error. A wrong/missing database URL or an origin mismatch is a configuration failure, not proof that an operating system is unsupported.
