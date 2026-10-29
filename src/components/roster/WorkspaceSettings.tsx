"use client";

import { useState } from "react";
import CatalogManagement from "./CatalogManagement";
import OperationsSettings, {
  OperationsSection,
  WorkspaceActionProps,
} from "../OperationsSettings";
import { updateSolverCustomConfig } from "@/domain/roster/service";

export type SettingsTab = OperationsSection | "rules" | "team";
export const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "rules", label: "Scheduling" },
  { id: "assignments", label: "Eligibility" },
  { id: "availability", label: "Time off" },
  { id: "services", label: "Services" },
  { id: "team", label: "Catalog & leads" },
  { id: "holidays", label: "Holidays" },
  { id: "history", label: "History" },
];

export default function WorkspaceSettings({
  workspace,
  run,
  tab,
  onTabChange,
}: WorkspaceActionProps & {
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}) {
  return (
    <div>
      <nav className="settings-tabs" aria-label="Settings sections">
        {settingsTabs.map((item) => (
          <button
            key={item.id}
            aria-pressed={tab === item.id}
            onClick={() => onTabChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {tab === "rules" ? (
        <SchedulingRules workspace={workspace} run={run} />
      ) : tab === "team" ? (
        <CatalogManagement workspace={workspace} run={run} />
      ) : (
        <OperationsSettings
          key={tab}
          workspace={workspace}
          run={run}
          section={tab}
        />
      )}
    </div>
  );
}

function SchedulingRules({ workspace, run }: WorkspaceActionProps) {
  const [config, setConfig] = useState(workspace.solverConfig);
  return (
    <form
      className="settings-stack"
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () => updateSolverCustomConfig("default", config),
          "Scheduling rules updated. Unlocked work regenerated and pins preserved.",
        );
      }}
    >
      <div className="section-intro">
        <h3>Scheduling preferences</h3>
        <p>
          Mandatory constraints always take priority. Preferences help rank
          otherwise valid choices; they are not guarantees.
        </p>
      </div>
      <label className="field">
        Maximum consecutive working days
        <input
          aria-label="Maximum consecutive working days"
          required
          type="number"
          min="1"
          max="14"
          value={config.maxConsecutiveDays}
          onChange={(event) =>
            setConfig({
              ...config,
              maxConsecutiveDays: Number(event.target.value),
            })
          }
        />
      </label>
      <p className="muted">
        Default: 6 working days before a rest day. This is a configured policy,
        not a complete labor-law ruleset. Recorded previous-month work is loaded
        automatically; missing history cannot establish earlier rest compliance.
      </p>
      <label className="field">
        Minimum rest between shifts (minutes)
        <input
          type="number"
          min="0"
          max="1440"
          step="1"
          value={config.minimumRestMinutes ?? 0}
          onChange={(event) =>
            setConfig({
              ...config,
              minimumRestMinutes: Number(event.target.value),
            })
          }
        />
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={config.honorPreferredOffDay}
          onChange={(event) =>
            setConfig({ ...config, honorPreferredOffDay: event.target.checked })
          }
        />
        Prefer requested off-days
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={config.enforcePodAffinity}
          onChange={(event) =>
            setConfig({ ...config, enforcePodAffinity: event.target.checked })
          }
        />
        Prefer people from the same pod
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={config.preferPrimaryContinuity}
          onChange={(event) =>
            setConfig({
              ...config,
              preferPrimaryContinuity: event.target.checked,
            })
          }
        />
        Prefer the designated primary employee
      </label>
      <div>
        <button className="button button-primary" type="submit">
          Save rules & regenerate
        </button>
      </div>
      <section className="form-section">
        <h3>Always validated</h3>
        <p className="muted">
          Approved unavailability · explicit eligibility · daily capacity ·
          distinct-person coverage · consecutive-day limit · allocation
          integrity
        </p>
      </section>
    </form>
  );
}
