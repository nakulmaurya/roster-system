"use client";

import { useState } from "react";
import { CalendarDays, Database, ShieldCheck, ArrowRight } from "lucide-react";

interface Props {
  loading: boolean;
  busy: boolean;
  error: string | null;
  tryDemo: () => Promise<unknown>;
  signIn: (username: string, password: string) => Promise<unknown>;
}

/** Explicit server-issued demo session; never silently falls back to local data. */
export default function AccessGate({
  loading,
  busy,
  error,
  tryDemo,
  signIn,
}: Props) {
  const [showSignIn, setShowSignIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return (
    <main className="access-page">
      <div className="access-card">
        <div className="access-mark">
          <CalendarDays size={25} />
        </div>
        <p className="heading-eyebrow">DATASTRAW · OPERATIONS PLANNING</p>
        <h1>One team. One clear roster.</h1>
        <p className="access-description">
          Plan coverage, handle changes and publish a validated schedule. Built
          around the way your team actually works.
        </p>
        <div className="access-capabilities">
          <span>
            <Database size={17} /> Shared PostgreSQL storage
          </span>
          <span>
            <ShieldCheck size={17} /> Server-validated changes
          </span>
        </div>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        {loading ? (
          <p role="status">Checking your session…</p>
        ) : (
          <>
            <button
              className="button button-primary access-demo"
              disabled={busy}
              onClick={() => void tryDemo()}
            >
              {busy ? "Opening workspace…" : "Try the interactive demo"}
              <ArrowRight size={17} />
            </button>
            <p className="muted">
              30 fictional employees · Mixed brand calendars · Your own
              isolated, temporary database workspace. No account required.
            </p>
            <button
              className="button button-quiet"
              disabled={busy}
              onClick={() => setShowSignIn((value) => !value)}
              aria-expanded={showSignIn}
            >
              Sign in to a managed workspace
            </button>
            {showSignIn && (
              <form
                className="form-section"
                onSubmit={async (event) => {
                  event.preventDefault();
                  try {
                    await signIn(username, password);
                  } finally {
                    setPassword("");
                  }
                }}
              >
                <label className="field">
                  Username
                  <input
                    autoComplete="username"
                    required
                    maxLength={200}
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </label>
                <label className="field">
                  Password
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={256}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <button
                  className="button button-primary"
                  disabled={busy}
                  type="submit"
                >
                  Sign in
                </button>
              </form>
            )}
          </>
        )}
      </div>
      <p className="access-footnote">
        Configurable rules. Explainable conflicts. Human-controlled publishing.
      </p>
    </main>
  );
}
