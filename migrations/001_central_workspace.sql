BEGIN;
CREATE TABLE IF NOT EXISTS roster_workspaces (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('real','demo')),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  library jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CHECK ((kind = 'demo') = (expires_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS roster_sessions (
  token_hash text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES roster_workspaces(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('manager','viewer')),
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS roster_sessions_expiry ON roster_sessions(expires_at);
CREATE INDEX IF NOT EXISTS roster_workspaces_expiry ON roster_workspaces(expires_at) WHERE kind='demo';
CREATE TABLE IF NOT EXISTS roster_publications (
  workspace_id uuid NOT NULL REFERENCES roster_workspaces(id) ON DELETE CASCADE,
  period text NOT NULL,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  PRIMARY KEY(workspace_id,period,version)
);
CREATE OR REPLACE FUNCTION roster_immutable_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' OR EXISTS (SELECT 1 FROM roster_workspaces WHERE id=OLD.workspace_id) THEN
    RAISE EXCEPTION 'Publication history is immutable';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS roster_publications_immutable ON roster_publications;
CREATE TRIGGER roster_publications_immutable BEFORE UPDATE OR DELETE ON roster_publications
FOR EACH ROW EXECUTE FUNCTION roster_immutable_publication();
CREATE TABLE IF NOT EXISTS roster_rate_events (
  bucket text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS roster_rate_lookup ON roster_rate_events(bucket,occurred_at);
COMMIT;
