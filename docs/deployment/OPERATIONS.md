# Deployment operations

Use the final release verification document for actual tested deployment evidence. This is not an uptime or security certification.

## Safe rollout

1. Install a supported Node runtime and PostgreSQL, with a restricted application role and separate test role/database. Bind PostgreSQL only to loopback or a private network.
2. Store `DATABASE_URL`, exact HTTPS `APP_ORIGIN` and scrypt hashes in an owner-readable mode0600 EnvironmentFile outside the repository. Never copy probe cookies, credentials or DB backups into source/download ZIPs.
3. Build/test an isolated release; take a backup before future migrations. Run the idempotent current migration, then switch only the dedicated roster service. Retain the old release and unit configuration.
4. Verify session endpoint, actual demo provisioning, revision writes, server-side publication, logout and outside-VM browser access—not just a local200.
5. After a failed rollout, restore the old application unit and restart only that service. Database migration rollback is a separate decision; do not blindly run destructive reverse migrations. Current migration is additive to the new dedicated roster database.

## Managed access

The deployed setup stores initial randomly generated manager/viewer credentials privately in the VM owner's `~/apps/roster-config/roster-initial-access.json` (mode0600). They are not included in this repository or shown in chat. Retrieve them only through an already-authorized SSH session. Rotate before using real personnel data.

Generate a password hash from stdin with `node scripts/roster-password-hash.mjs`. Configure `ROSTER_ADMIN_USERNAME`/`ROSTER_ADMIN_PASSWORD_HASH` and optional viewer equivalents in the private EnvironmentFile; quote hashes so dollar signs remain literal. Restart the roster service after configuration changes. This is intentionally limited account administration, not an enterprise identity provider, MFA or self-service password-reset system.

## Backups and cleanup

`scripts/roster-backup.mjs` requires `DATABASE_URL` and a private `ROSTER_BACKUP_DIR`. It invokes pg_dump without a password in argv, writes an atomic mode0600 custom-format backup and retains local dumps for seven days. The verified VM enables `datastraw-roster-backup.timer` daily with a private `/var/backups/roster` destination. A manual run and a disposable restore were tested; see release evidence. `scripts/roster-cleanup.mjs` removes expired demos/sessions and stale rate events without deleting real workspaces.

Local backups protect against accidental changes, not VM/disk loss. Add encrypted offsite replication and monitored restore drills before operational reliance. Test restoration into a separate disposable database, never overwrite the live database to prove a backup works.

## Public endpoint

The dedicated cloudflared service proxies HTTPS to a loopback-only roster app. The official binary's upstream SHA-256 was checked; it is not bundled in the source archive. A Quick Tunnel needs no account but is for testing/development and has no uptime guarantee. Its hostname changes when recreated; update APP_ORIGIN to the new exact hostname, restart the app and reverify. Do not remove Origin/CSRF checks or expose the database to work around an origin/configuration error.

For stable submission/production availability, replace it with a named tunnel/domain or durable HTTPS hosting under an operator-owned account. Cloud routing/account permissions cannot be fabricated by the application.

## Monitoring and scope

Inspect only dedicated roster service logs and avoid printing secrets. Monitor process health, DB space, demo/login caps, failed requests and backup failures. Current caps are bounded assessment anti-abuse protection, not a full WAF or capacity-tested SLA. Dependency/license inventories and point-in-time audits are review evidence, not security guarantees.
