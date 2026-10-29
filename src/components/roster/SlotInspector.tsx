"use client";

import { useState } from "react";
import {
  LockKeyhole,
  UnlockKeyhole,
  Trash2,
  CircleAlert,
  ArrowRight,
} from "lucide-react";
import { coverageForSlot } from "@/core/engine";
import {
  getReplacementSuggestions,
  removeAllocation,
  toggleCellLock,
  updateCellAllocation,
} from "@/domain/roster/service";
import type { WorkspaceActionProps } from "../OperationsSettings";
import { avatarTone, cleanName, dateLabel, initials } from "./presentation";

export default function SlotInspector({
  workspace,
  run,
  slotId,
}: WorkspaceActionProps & { slotId: string }) {
  const [manualEmployeeId, setManualEmployeeId] = useState("");
  const slot = workspace.problem.demandSlots.find((item) => item.id === slotId);
  const allocations = workspace.allocations.filter(
    (allocation) => allocation.slotId === slotId,
  );
  const candidates = slot ? getReplacementSuggestions("default", slotId) : [];
  const date = slot?.date ?? allocations[0]?.date;
  const serviceId = slot?.serviceId ?? allocations[0]?.serviceId;
  const issues = workspace.violations.filter(
    (violation) =>
      violation.severity === "BLOCKER" &&
      violation.date === date &&
      (violation.affectedServiceIds.includes(serviceId ?? "") ||
        allocations.some((allocation) =>
          violation.affectedResourceIds.includes(allocation.resourceId),
        )),
  );
  const covered = slot
    ? coverageForSlot(workspace.problem, slot, workspace.allocations)
    : 0;
  const assign = (employeeId: string) =>
    run(
      () => updateCellAllocation("default", slotId, employeeId, true),
      "Assignment updated and pinned. Mandatory rules revalidated.",
    );
  return (
    <div>
      <div className="inspector-summary">
        <span className="muted">
          {date
            ? dateLabel(date, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })
            : "Unknown date"}
        </span>
        <span
          className={`status-tag ${slot && covered >= slot.minResourceCount && !issues.length ? "published" : "warning"}`}
        >
          {slot
            ? `${covered} / ${slot.minResourceCount} covered`
            : "Outside requirements"}
        </span>
      </div>
      {slot && (
        <p className="muted" style={{ marginBottom: 20 }}>
          {slot.shift
            ? `${String(Math.floor(slot.shift.startMinute / 60)).padStart(2, "0")}:${String(slot.shift.startMinute % 60).padStart(2, "0")}–${String(Math.floor(slot.shift.endMinute / 60)).padStart(2, "0")}:${String(slot.shift.endMinute % 60).padStart(2, "0")}${slot.shift.endMinute <= slot.shift.startMinute ? " (+1 day)" : ""} · ${slot.shift.timezone}`
            : "Legacy full-day interval · Asia/Kolkata"}
        </p>
      )}
      {!slot && (
        <p className="issue-inline">
          This assignment no longer matches an operating requirement. Remove it
          or restore the appropriate calendar rule.
        </p>
      )}
      {issues.map((issue) => (
        <div className="issue-inline" key={issue.id}>
          <strong>Needs attention</strong>
          <p>{issue.message}</p>
        </div>
      ))}
      <section className="inspector-section">
        <h3>Assigned people</h3>
        {allocations.length === 0 && (
          <p className="muted">
            No one is assigned yet. Choose an eligible person below.
          </p>
        )}
        {allocations.map((allocation) => {
          const employee = workspace.dataset.employees.find(
            (item) => item.id === allocation.resourceId,
          );
          return (
            <div className="assignment-item" key={allocation.id}>
              <span
                className={`avatar large ${avatarTone(allocation.resourceId)}`}
              >
                {initials(employee?.name ?? "?")}
              </span>
              <div className="person-copy">
                <strong>
                  {cleanName(employee?.name ?? "Unknown employee")}
                </strong>
                <p>
                  {allocation.isLocked
                    ? "Pinned assignment"
                    : "Generated assignment"}{" "}
                  · {Math.round(allocation.capacityConsumed * 100)}% capacity
                </p>
              </div>
              <button
                className="icon-button"
                aria-label={
                  allocation.isLocked
                    ? `Unpin ${cleanName(employee?.name ?? "assignment")}`
                    : `Pin ${cleanName(employee?.name ?? "assignment")}`
                }
                onClick={() =>
                  run(
                    () => toggleCellLock("default", allocation.id),
                    allocation.isLocked
                      ? "Assignment unpinned."
                      : "Assignment pinned.",
                  )
                }
              >
                {allocation.isLocked ? (
                  <LockKeyhole size={17} />
                ) : (
                  <UnlockKeyhole size={17} />
                )}
              </button>
              <button
                className="icon-button"
                title="Remove allocation"
                aria-label={`Remove ${cleanName(employee?.name ?? "assignment")}`}
                onClick={() => {
                  if (
                    allocation.isLocked &&
                    !window.confirm(
                      "Remove this pinned assignment? This may create a coverage gap.",
                    )
                  )
                    return;
                  run(
                    () => removeAllocation("default", allocation.id),
                    "Assignment removed. Coverage revalidated.",
                  );
                }}
              >
                <Trash2 size={17} />
              </button>
            </div>
          );
        })}
      </section>
      {slot && (
        <section className="inspector-section">
          <h3>
            Eligible replacements{" "}
            <span className="muted">· {candidates.length}</span>
          </h3>
          <p className="muted" style={{ marginBottom: 15 }}>
            Ranked by authorization, pod, workload and fatigue. No new
            eligibility is inferred.
          </p>
          {candidates.length === 0 ? (
            <div className="empty-state">
              <CircleAlert size={22} style={{ margin: "0 auto 9px" }} />
              <p>
                No eligible replacement is currently available without violating
                the configured candidate checks.
              </p>
            </div>
          ) : (
            candidates.map((candidate) => {
              const employee = workspace.dataset.employees.find(
                (item) => item.id === candidate.resourceId,
              );
              return (
                <div className="candidate-card" key={candidate.resourceId}>
                  <div className="candidate-topline">
                    <span
                      className={`avatar large ${avatarTone(candidate.resourceId)}`}
                    >
                      {initials(employee?.name ?? "?")}
                    </span>
                    <div className="person-copy">
                      <strong>
                        {cleanName(employee?.name ?? candidate.resourceId)}
                      </strong>
                      <p>
                        {candidate.roleTier.toLowerCase()} ·{" "}
                        {candidate.monthWorkDays} days scheduled
                      </p>
                    </div>
                    <button
                      className="button"
                      onClick={() => assign(candidate.resourceId)}
                    >
                      Assign
                      <ArrowRight size={14} />
                    </button>
                  </div>
                  <p className="candidate-reasons">
                    {candidate.reasons.join(" · ")}
                  </p>
                </div>
              );
            })
          )}
        </section>
      )}
      {slot && (
        <details className="advanced-section">
          <summary>Manual override</summary>
          <p className="muted">
            You can assign any employee, but availability, authorization and
            capacity violations will still block publication.
          </p>
          <label className="field">
            Employee
            <select
              aria-label="Manual assignment employee"
              value={manualEmployeeId}
              onChange={(event) => setManualEmployeeId(event.target.value)}
            >
              <option value="">Select an employee</option>
              {workspace.dataset.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button"
            disabled={!manualEmployeeId}
            onClick={() => assign(manualEmployeeId)}
          >
            Apply manual assignment
          </button>
        </details>
      )}
    </div>
  );
}
