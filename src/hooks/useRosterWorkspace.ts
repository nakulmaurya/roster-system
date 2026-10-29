"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ZodError } from "zod";
import {
  RosterWorkspaceState,
  exportWorkspaceLibrary,
  importWorkspaceLibrary,
  resetWorkspaceToDemo,
} from "@/domain/roster/service";

export type SaveState = "saved" | "memory" | "conflict" | "recovery";
export interface Notice {
  kind: "success" | "error" | "info";
  message: string;
}
interface Auth {
  authenticated: boolean;
  role?: "manager" | "viewer";
  kind?: "real" | "demo";
  csrfToken?: string;
  expiresAt?: string;
}
interface Snapshot {
  revision: number;
  library: string;
  workspace: RosterWorkspaceState;
  role: "manager" | "viewer";
  kind: "real" | "demo";
}
interface ClientDocument {
  period: { year: number; month: number };
  publications: RosterWorkspaceState["publications"];
  [key: string]: unknown;
}
interface ClientLibrary {
  workspaces: Record<string, ClientDocument>;
  [key: string]: unknown;
}
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function errorMessage(error: unknown) {
  if (error instanceof ZodError)
    return error.issues
      .slice(0, 3)
      .map(
        (issue) =>
          `${issue.path.join(".") || "Configuration"}: ${issue.message}`,
      )
      .join(" · ");
  return error instanceof Error
    ? error.message
    : "The change could not be applied.";
}
export function downloadText(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
  });
  const value = await res.json();
  if (!res.ok)
    throw new ApiError(res.status, value.message || "Server request failed.");
  return value as T;
}
function key(doc: ClientDocument) {
  return `${doc.period.year}-${doc.period.month}`;
}
function historyByPeriod(library: string) {
  const parsed = JSON.parse(library) as ClientLibrary;
  const map = new Map(
    Object.values(parsed.workspaces).map((doc) => [key(doc), doc.publications]),
  );
  map.set(
    key(parsed.workspaces.default),
    parsed.workspaces.default.publications,
  );
  return map;
}

/** PostgreSQL is authoritative. The domain module is only a read mirror / proposal builder. */
export function useRosterWorkspace() {
  const [workspace, setWorkspace] = useState<RosterWorkspaceState | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [auth, setAuth] = useState<Auth>({ authenticated: false });
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const current = useRef<Snapshot | null>(null),
    authRef = useRef<Auth>(auth),
    working = useRef(false);
  const recoverable = useRef<string | null>(null);
  const adopt = useCallback((snapshot: Snapshot) => {
    importWorkspaceLibrary(snapshot.library);
    current.current = snapshot;
    setWorkspace(structuredClone(snapshot.workspace));
    setSaveState("saved");
  }, []);
  const adoptAuth = useCallback((value: Auth) => {
    authRef.current = value;
    setAuth(value);
  }, []);
  const fail = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 409)
        setSaveState("conflict");
      if (error instanceof ApiError && error.status === 401) {
        adoptAuth({ authenticated: false });
        current.current = null;
        setWorkspace(null);
      }
      setNotice({ kind: "error", message: errorMessage(error) });
    },
    [adoptAuth],
  );
  const load = useCallback(async () => {
    adopt(await api<Snapshot>("/api/workspace"));
  }, [adopt]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const info = await api<Auth>("/api/session");
        if (!alive) return;
        adoptAuth(info);
        if (info.authenticated) {
          const snapshot = await api<Snapshot>("/api/workspace");
          if (alive) adopt(snapshot);
        }
      } catch (error) {
        if (alive) setAuthError(errorMessage(error));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [adopt, adoptAuth]);
  useEffect(() => {
    if (!notice || notice.kind === "error") return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const authenticate = useCallback(
    async (path: string, body: unknown) => {
      if (working.current) return false;
      working.current = true;
      setBusy(true);
      setAuthError(null);
      try {
        const info = await api<Auth>(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        adoptAuth(info);
        await load();
        return true;
      } catch (error) {
        setAuthError(errorMessage(error));
        return false;
      } finally {
        working.current = false;
        setBusy(false);
      }
    },
    [adoptAuth, load],
  );
  const submit = useCallback(
    async (proposal: string, publish: boolean, message?: string) => {
      const base = current.current;
      if (!base || !authRef.current.csrfToken)
        throw new Error("Sign in or start a demo first.");
      const snapshot = await api<Snapshot>("/api/workspace", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": authRef.current.csrfToken,
        },
        body: JSON.stringify({
          type: "commit",
          revision: base.revision,
          library: proposal,
          publish,
        }),
      });
      adopt(snapshot);
      if (message) setNotice({ kind: "success", message });
      return true;
    },
    [adopt],
  );
  const run = useCallback(
    async (action: () => RosterWorkspaceState, message?: string) => {
      if (working.current) {
        setNotice({
          kind: "info",
          message: "Wait for the current server operation to finish.",
        });
        return false;
      }
      if (!current.current || authRef.current.role !== "manager") {
        setNotice({
          kind: "error",
          message: "A manager session is required to make changes.",
        });
        return false;
      }
      if (saveState === "conflict") {
        setNotice({
          kind: "error",
          message: "Reload the latest server version before editing.",
        });
        return false;
      }
      working.current = true;
      setBusy(true);
      const original = current.current.library;
      try {
        importWorkspaceLibrary(original);
        action();
        const proposed = JSON.parse(exportWorkspaceLibrary()) as ClientLibrary;
        const histories = historyByPeriod(original);
        let publish = false;
        for (const [id, doc] of Object.entries(proposed.workspaces)) {
          const old = histories.get(key(doc)) ?? [];
          if (
            id === "default" &&
            doc.publications.length === old.length + 1 &&
            JSON.stringify(doc.publications.slice(0, -1)) ===
              JSON.stringify(old)
          ) {
            publish = true;
            doc.publications = old; // Request publication; never submit a client-generated snapshot.
          }
        }
        importWorkspaceLibrary(original); // Read getters remain on the acknowledged state while awaiting HTTP.
        return await submit(JSON.stringify(proposed), publish, message);
      } catch (error) {
        if (current.current) importWorkspaceLibrary(current.current.library);
        fail(error);
        return false;
      } finally {
        working.current = false;
        setBusy(false);
      }
    },
    [fail, saveState, submit],
  );
  const replaceDraft = useCallback(
    async (content: string, message: string) => {
      if (
        working.current ||
        !current.current ||
        authRef.current.role !== "manager"
      )
        return false;
      working.current = true;
      setBusy(true);
      const original = current.current.library;
      try {
        // Imports are explicit draft proposals. Backups cannot overwrite authenticated publication history.
        importWorkspaceLibrary(content);
        const proposed = JSON.parse(exportWorkspaceLibrary()) as ClientLibrary;
        const history = historyByPeriod(original);
        for (const doc of Object.values(proposed.workspaces)) {
          doc.publications = history.get(key(doc)) ?? [];
          doc.status = "DRAFT";
        }
        importWorkspaceLibrary(original);
        return await submit(JSON.stringify(proposed), false, message);
      } catch (error) {
        if (current.current) importWorkspaceLibrary(current.current.library);
        fail(error);
        return false;
      } finally {
        working.current = false;
        setBusy(false);
      }
    },
    [fail, submit],
  );
  const restore = useCallback(
    async (file?: File) => {
      if (
        !file ||
        !window.confirm(
          "Import this backup as server drafts? Existing published history will be preserved, not replaced.",
        )
      )
        return;
      if (file.size > 1_800_000) {
        setNotice({
          kind: "error",
          message: "Backup exceeds the server import limit (1.8 MB).",
        });
        return;
      }
      await replaceDraft(
        await file.text(),
        "Backup imported as server drafts. Existing publication history preserved.",
      );
    },
    [replaceDraft],
  );
  const reset = useCallback(async () => {
    if (
      !current.current ||
      working.current ||
      !window.confirm(
        "Reset the active draft to fictional sample data? Existing published history will remain immutable.",
      )
    )
      return false;
    const original = current.current.library;
    try {
      importWorkspaceLibrary(original);
      resetWorkspaceToDemo();
      const proposal = exportWorkspaceLibrary();
      importWorkspaceLibrary(original);
      return await replaceDraft(
        proposal,
        "Active draft reset. Publication history preserved.",
      );
    } catch (error) {
      importWorkspaceLibrary(original);
      fail(error);
      return false;
    }
  }, [fail, replaceDraft]);
  const acceptExternal = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await load();
      setNotice({ kind: "info", message: "Loaded the latest server version." });
    } catch (error) {
      fail(error);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }, [fail, load]);
  const signOut = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await api("/api/session", {
        method: "DELETE",
        headers: { "X-CSRF-Token": authRef.current.csrfToken ?? "" },
      });
      adoptAuth({ authenticated: false });
      current.current = null;
      setWorkspace(null);
      setNotice(null);
    } catch (error) {
      fail(error);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }, [adoptAuth, fail]);
  return {
    workspace,
    saveState,
    notice,
    setNotice,
    run,
    restore,
    reset,
    acceptExternal,
    loading,
    busy,
    authenticated: auth.authenticated,
    role: auth.role,
    sessionKind: auth.kind,
    authError,
    tryDemo: () => authenticate("/api/demo", {}),
    signIn: (username: string, password: string) =>
      authenticate("/api/session", { username, password }),
    signOut,
    migrateLocalBackup: async () => {
      try {
        const text = localStorage.getItem("datastraw-workspaces-v1");
        if (!text) throw new Error("No legacy browser backup found.");
        recoverable.current = text;
        if (
          window.confirm(
            "Explicitly migrate this browser’s legacy backup into server drafts? Published history remains server-owned.",
          )
        )
          await replaceDraft(text, "Legacy backup migrated as drafts.");
      } catch (error) {
        fail(error);
      }
    },
    backup: () => {
      if (current.current)
        downloadText(
          current.current.library,
          "roster-workspace-backup.json",
          "application/json",
        );
    },
    recoveryBackup: () => {
      if (recoverable.current)
        downloadText(
          recoverable.current,
          "roster-recovery-original.json",
          "application/json",
        );
    },
  };
}
