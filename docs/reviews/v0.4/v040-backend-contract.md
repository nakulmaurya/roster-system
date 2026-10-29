# v040 backend contract (implementation in progress)

PostgreSQL is mandatory (`DATABASE_URL`). `pg` + `@types/pg` are the only dependency additions. No deployment/service changes by backend worker.

- GET /api/session -> {authenticated:false} or {authenticated:true,role,kind,csrfToken,expiresAt}. Cookie is HTTPOnly, SameSite=Lax, Secure in production.
- POST /api/demo `{}` -> isolated fictional PostgreSQL workspace + scoped manager session. Explicit Try demo; no unauthenticated write fallback. Bounded global provisioning cap/rate and TTL cleanup.
- POST /api/session `{username,password}` -> configured admin/viewer credentials; DELETE logs out. Both need exact configured APP_ORIGIN Origin.
- GET /api/workspace -> {revision,library,workspace,role,kind}; library is JSON string compatible with existing domain service.
- POST /api/workspace -> `{type:'commit',revision,library,publish?:boolean}` or `{type:'publish',revision}`. Must send Origin and X-CSRF-Token. 401 unauth, 403 viewer/CSRF, 409 stale, 422 invalid proposal/publication, 413 oversized, 503 DB/config unavailable.
- Client history edits/deletions are rejected. Publish requests rerun server audit and generate their own timestamp/history/version. Client flags never confer publication. Revision is DB CAS within row lock + transaction.

Hook compatibility: workspace/run/restore/reset/acceptExternal/backup/recoveryBackup retained. run(action,message) becomes Promise<boolean>; callers that branch on success MUST await it. No optimistic success before DB ack. Adds loading,busy,authenticated,role,sessionKind,authError,tryDemo(),signIn(username,password),signOut(),migrateLocalBackup(). Initial workspace null until authenticated; parent must render login/demo/loading controls before null-return spinner. saveState retains old union for compile compatibility; only saved/conflict used (errors in notice). Diff/replacement getters read a server-hydrated local domain mirror. No localStorage autosave; legacy migration explicitly invoked only.

Existing UI labels saying browser-local / local snapshot must be updated by UI owner. Real workspace inaccessible from demo credentials; session scope is server-side only.
