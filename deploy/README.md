# Deployment

The current tested deployment uses Node24, PostgreSQL17 and systemd. See `../docs/deployment/postgresql-sessions.md`, `../docs/deployment/OPERATIONS.md` and `../docs/RELEASE_VERIFICATION.md`.

`systemd/` contains the actual dedicated roster unit templates from the verified VM: least-privilege app/tunnel accounts, loopback app port3400 and private environment file, plus daily local backup timer. Create service users/directories, install the Node runtime, configure an exact public HTTPS APP_ORIGIN, apply migrations and adjust absolute release paths before enabling. They are not a one-command portable provisioning system. Never copy a real credential file into the repository.

Cloudflared binary is not bundled; verify the official upstream version and checksum before installing. Quick Tunnels have no stable hostname/SLA. A named domain/tunnel or durable hosting account must be operator-owned. No cloud firewall or unrelated VM service is modified by these templates.
