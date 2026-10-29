"use client";

import { useState } from "react";
import type { WorkspaceActionProps } from "../OperationsSettings";
import {
  applyManagementCommand,
  managementRemovalBlockers,
  type CatalogKind,
  type ManagementCommand,
  type RemovableKind,
} from "@/domain/roster/management";
import { serviceLabel } from "./presentation";

const catalogs: Array<{ id: CatalogKind; label: string }> = [
  { id: "employees", label: "People" },
  { id: "brands", label: "Brands" },
  { id: "processes", label: "Processes" },
  { id: "pods", label: "Pods & leads" },
];

export default function CatalogManagement(props: WorkspaceActionProps) {
  const [kind, setKind] = useState<CatalogKind>("employees");
  const [selected, setSelected] = useState("");
  const [generation, setGeneration] = useState(0);
  const record = props.workspace.dataset[kind].find(
    (item) => item.id === selected,
  );
  return (
    <div className="settings-stack">
      <div className="section-intro">
        <h3>Catalog & pod leads</h3>
        <p>
          Changes apply to the open month only. Other-month catalogs and
          published snapshots are retained; newly opened months inherit this
          month’s configuration. Changes revalidate existing work without
          regenerating or dropping pins. A changed published month must be
          reviewed and published again. Adjacent months may also require review
          if their work-history dependencies change.
        </p>
      </div>
      <nav className="settings-tabs" aria-label="Catalog sections">
        {catalogs.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={kind === item.id}
            onClick={() => {
              setKind(item.id);
              setSelected("");
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <label className="field">
        Catalog record
        <select
          value={record?.id ?? ""}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">Add new</option>
          {props.workspace.dataset[kind].map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <CatalogEditor
        {...props}
        kind={kind}
        id={record?.id}
        key={`${props.workspace.period.year}-${props.workspace.period.month}:${kind}:${record?.id ?? "new"}:${JSON.stringify(record)}:${generation}`}
        onCreated={() => setGeneration((value) => value + 1)}
      />
      <RequirementRemoval
        {...props}
        key={`${props.workspace.period.year}-${props.workspace.period.month}`}
      />
    </div>
  );
}

function CatalogEditor({
  workspace,
  run,
  kind,
  id,
  onCreated,
}: WorkspaceActionProps & {
  kind: CatalogKind;
  id?: string;
  onCreated: () => void;
}) {
  const d = workspace.dataset;
  const employee =
    kind === "employees" ? d.employees.find((e) => e.id === id) : undefined;
  const brand =
    kind === "brands" ? d.brands.find((b) => b.id === id) : undefined;
  const process =
    kind === "processes" ? d.processes.find((p) => p.id === id) : undefined;
  const pod = kind === "pods" ? d.pods.find((p) => p.id === id) : undefined;
  const record = d[kind].find((item) => item.id === id);
  const [name, setName] = useState(record?.name ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [podId, setPodId] = useState(
    employee?.podId ?? brand?.podId ?? d.pods[0]?.id ?? "",
  );
  const [capacity, setCapacity] = useState(employee?.maxDailyCapacity ?? 1);
  const [offDay, setOffDay] = useState(employee?.preferredOffDay ?? 0);
  const [model, setModel] = useState<"SINGLE" | "MULTI">(
    brand?.staffingModel ?? "SINGLE",
  );
  const [code, setCode] = useState(process?.code ?? "");
  const [leadId, setLeadId] = useState(
    pod?.leadEmployeeId ?? d.employees[0]?.id ?? "",
  );
  const [pending, setPending] = useState(false);
  const blockers = id ? managementRemovalBlockers(workspace, kind, id) : [];
  const missingReference =
    ((kind === "employees" || kind === "brands") && !podId) ||
    (kind === "pods" && !leadId);
  const commit = async (command: ManagementCommand, message: string) => {
    setPending(true);
    try {
      const saved = await run(
        () => applyManagementCommand("default", command),
        message,
      );
      if (saved && command.action === "create") onCreated();
    } finally {
      setPending(false);
    }
  };
  const submit = () => {
    const inputByKind = {
      employees: {
        name,
        email,
        podId,
        maxDailyCapacity: capacity,
        preferredOffDay: offDay,
      },
      brands: { name, podId, staffingModel: model },
      processes: { name, code },
      pods: { name, leadEmployeeId: leadId },
    };
    // Distribute the matching kind/input pair to the command union.
    const command = (
      id
        ? { action: "update", kind, id, input: inputByKind[kind] }
        : { action: "create", kind, input: inputByKind[kind] }
    ) as ManagementCommand;
    void commit(
      command,
      "Catalog saved for this month. Existing work revalidated; review before publishing.",
    );
  };
  return (
    <form
      className="form-section"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h3>
        {id ? "Edit" : "Add"}{" "}
        {kind === "employees"
          ? "person"
          : kind === "brands"
            ? "brand"
            : kind === "pods"
              ? "pod"
              : "process"}
      </h3>
      <fieldset disabled={pending}>
        <label className="field">
          Name
          <input
            required
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {(kind === "employees" || kind === "brands") && (
          <label className="field">
            Pod
            <select
              required
              value={podId}
              onChange={(event) => setPodId(event.target.value)}
            >
              <option value="" disabled>
                Select a pod
              </option>
              {d.pods.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === "employees" && (
          <>
            <label className="field">
              Email (optional)
              <input
                type="email"
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <div className="form-grid">
              <label className="field">
                Daily capacity
                <input
                  type="number"
                  required
                  min="0.01"
                  step="any"
                  value={capacity}
                  onChange={(event) => setCapacity(Number(event.target.value))}
                />
              </label>
              <label className="field">
                Preferred off-day
                <select
                  value={offDay}
                  onChange={(event) => setOffDay(Number(event.target.value))}
                >
                  {[
                    "Sunday",
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ].map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="muted">
              New people have no service eligibility. Use Eligibility to
              authorize Primary, Backup or Relief coverage.
            </p>
          </>
        )}
        {kind === "brands" && (
          <>
            <label className="field">
              Staffing model
              <select
                value={model}
                onChange={(event) =>
                  setModel(event.target.value as "SINGLE" | "MULTI")
                }
              >
                <option value="SINGLE">Single primary</option>
                <option value="MULTI">Multiple resources</option>
              </select>
            </label>
            <p className="muted">
              New brands have no service requirements or eligibility. Configure
              their processes, calendars and staffing in Services, then
              authorize people in Eligibility.
            </p>
          </>
        )}
        {kind === "processes" && (
          <>
            <label className="field">
              Process code
              <input
                required
                maxLength={200}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <p className="muted">
              Creating a process does not add demand. Attach it to a brand in
              Services.
            </p>
          </>
        )}
        {kind === "pods" && (
          <>
            <label className="field">
              Pod lead
              <select
                required
                value={leadId}
                onChange={(event) => setLeadId(event.target.value)}
              >
                <option value="" disabled>
                  Select a lead
                </option>
                {d.employees.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">
              Every pod requires an existing employee as lead. To remove a lead,
              choose a replacement here. Leadership does not grant service
              eligibility or automatically move the employee to this pod.
            </p>
          </>
        )}
        <div className="button-row">
          <button
            type="submit"
            className="button button-primary"
            disabled={pending || missingReference}
          >
            {pending ? "Saving…" : id ? "Save changes" : "Add record"}
          </button>
          {id && (
            <button
              type="button"
              className="button button-danger-quiet"
              disabled={pending || blockers.length > 0}
              aria-describedby={
                blockers.length ? `remove-${kind}-reasons` : undefined
              }
              onClick={() =>
                void commit(
                  { action: "remove", kind, id },
                  "Unreferenced catalog record removed from this month.",
                )
              }
            >
              Remove record
            </button>
          )}
        </div>
      </fieldset>
      {id && <RemovalExplanation kind={kind} blockers={blockers} />}
    </form>
  );
}

function RemovalExplanation({
  kind,
  blockers,
}: {
  kind: RemovableKind;
  blockers: string[];
}) {
  return (
    <div id={`remove-${kind}-reasons`} className="muted" role="status">
      {blockers.length ? (
        <>
          <p>Removal unavailable: this record is still referenced.</p>
          <ul>
            {blockers.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <p>
            No cascade is performed. Baseline/history references are
            intentionally retained. Keep the record for this month rather than
            deleting history.
          </p>
        </>
      ) : (
        <p>
          No current or baseline references. Removal affects this month only;
          published snapshots and other months remain intact.
        </p>
      )}
    </div>
  );
}

function RequirementRemoval({ workspace, run }: WorkspaceActionProps) {
  const [kind, setKind] = useState<"brandProcesses" | "assignments">(
    "brandProcesses",
  );
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState(false);
  const records = workspace.dataset[kind];
  const id = records.some((item) => item.id === selected) ? selected : "";
  const blockers = id ? managementRemovalBlockers(workspace, kind, id) : [];
  const label = (recordId: string) => {
    if (kind === "brandProcesses") return serviceLabel(workspace, recordId);
    const assignment = workspace.dataset.assignments.find(
      (item) => item.id === recordId,
    )!;
    const employee = workspace.dataset.employees.find(
      (item) => item.id === assignment.employeeId,
    );
    return `${employee?.name ?? assignment.employeeId} · ${serviceLabel(workspace, assignment.brandProcessId)} · ${assignment.role}`;
  };
  return (
    <section className="form-section">
      <h3>Remove an unused service or eligibility</h3>
      <p className="muted">
        Services and eligibility can be configured in their own tabs. This
        removal path is restricted: it never drops work, pins or baseline
        history.
      </p>
      <label className="field">
        Record type
        <select
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as typeof kind);
            setSelected("");
          }}
          disabled={pending}
        >
          <option value="brandProcesses">Service requirement</option>
          <option value="assignments">Eligibility assignment</option>
        </select>
      </label>
      <label className="field">
        Record to remove
        <select
          value={id}
          onChange={(event) => setSelected(event.target.value)}
          disabled={pending}
        >
          <option value="">Select a record</option>
          {records.map((item) => (
            <option key={item.id} value={item.id}>
              {label(item.id)}
            </option>
          ))}
        </select>
      </label>
      {id && <RemovalExplanation kind={kind} blockers={blockers} />}
      <button
        type="button"
        className="button button-danger-quiet"
        disabled={!id || blockers.length > 0 || pending}
        aria-describedby={id ? `remove-${kind}-reasons` : undefined}
        onClick={async () => {
          setPending(true);
          try {
            if (
              await run(
                () =>
                  applyManagementCommand("default", {
                    action: "remove",
                    kind,
                    id,
                  }),
                "Unreferenced configuration removed from this month. Existing work revalidated.",
              )
            )
              setSelected("");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Removing…" : "Remove selected record"}
      </button>
    </section>
  );
}
