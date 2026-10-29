"use client";

import { LockKeyhole, CircleAlert, Minus } from "lucide-react";
import { coverageForSlot } from "@/core/engine";
import type { RosterWorkspaceState } from "@/domain/roster/service";
import {
  avatarTone,
  cleanName,
  dateLabel,
  initials,
  processLabel,
  shortName,
  CalendarDensity,
  RosterView,
} from "./presentation";

interface Props {
  workspace: RosterWorkspaceState;
  dates: string[];
  density: CalendarDensity;
  view: RosterView;
  podId: string;
  processId: string;
  model: string;
  query: string;
  onlyIssues: boolean;
  onInspect: (slotId: string) => void;
}

export default function RosterTable({
  workspace,
  dates,
  density,
  view,
  podId,
  processId,
  model,
  query,
  onlyIssues,
  onInspect,
}: Props) {
  const { dataset, allocations, problem } = workspace;
  const search = query.trim().toLowerCase();
  const resourceMap = new Map(
    dataset.employees.map((employee) => [employee.id, employee]),
  );
  const brandMap = new Map(dataset.brands.map((brand) => [brand.id, brand]));
  const podMap = new Map(dataset.pods.map((pod) => [pod.id, pod]));
  const slotMap = new Map(problem.demandSlots.map((slot) => [slot.id, slot]));
  const allocationsBySlot = new Map<string, typeof allocations>();
  for (const allocation of allocations) {
    const current = allocationsBySlot.get(allocation.slotId) ?? [];
    current.push(allocation);
    allocationsBySlot.set(allocation.slotId, current);
  }
  const blockers = workspace.violations.filter(
    (violation) => violation.severity === "BLOCKER",
  );
  const services = dataset.brandProcesses
    .filter((service) => {
      const brand = brandMap.get(service.brandId);
      if (
        !brand ||
        (podId !== "ALL" && brand.podId !== podId) ||
        (model !== "ALL" && brand.staffingModel !== model)
      )
        return false;
      if (
        view === "PROCESS" &&
        processId !== "ALL" &&
        !(service.coveredProcessIds ?? [service.processId]).includes(processId)
      )
        return false;
      if (
        search &&
        !`${brand.name} ${processLabel(workspace, service)}`
          .toLowerCase()
          .includes(search)
      )
        return false;
      return (
        !onlyIssues ||
        blockers.some(
          (violation) =>
            dates.includes(violation.date) &&
            (violation.affectedServiceIds.includes(service.id) ||
              allocations.some(
                (allocation) =>
                  allocation.serviceId === service.id &&
                  allocation.date === violation.date &&
                  violation.affectedResourceIds.includes(allocation.resourceId),
              )),
        )
      );
    })
    .sort((a, b) => {
      const brandA = brandMap.get(a.brandId)!;
      const brandB = brandMap.get(b.brandId)!;
      return (
        (view === "POD" ? brandA.podId.localeCompare(brandB.podId) : 0) ||
        brandA.name.localeCompare(brandB.name) ||
        a.processId.localeCompare(b.processId)
      );
    });
  const employees = dataset.employees.filter(
    (employee) =>
      (podId === "ALL" || employee.podId === podId) &&
      (!search || employee.name.toLowerCase().includes(search)) &&
      (!onlyIssues ||
        blockers.some(
          (violation) =>
            dates.includes(violation.date) &&
            violation.affectedResourceIds.includes(employee.id),
        )),
  );
  const rowCount = view === "EMPLOYEE" ? employees.length : services.length;
  const width = 252 + dates.length * (density === "month" ? 62 : 124);

  return (
    <div className="roster-frame">
      <div
        className={`roster-scroll ${density === "month" ? "month-density" : ""}`}
        role="region"
        aria-label="Scrollable roster"
        tabIndex={0}
      >
        <table
          className="roster-table"
          style={{ minWidth: width }}
          aria-label={`${view === "EMPLOYEE" ? "Employee" : "Brand and process"} roster`}
        >
          <colgroup>
            <col style={{ width: 252 }} />
            {dates.map((date) => (
              <col key={date} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="row-heading">
                {view === "EMPLOYEE"
                  ? "People & working days"
                  : view === "POD"
                    ? "Pod / brand & process"
                    : "Brand & process"}
              </th>
              {dates.map((date) => {
                const weekend = [0, 6].includes(
                  new Date(`${date}T00:00:00Z`).getUTCDay(),
                );
                const holiday = dataset.publicHolidays.find(
                  (item) => item.holidayDate === date,
                );
                return (
                  <th
                    scope="col"
                    key={date}
                    className={weekend ? "weekend-heading" : ""}
                  >
                    <span className="date-number">
                      {dateLabel(date, { day: "numeric" })}
                    </span>
                    <span className="day-name">
                      {dateLabel(date, { weekday: "short" })}
                    </span>
                    {holiday && (
                      <span
                        className="holiday-mark"
                        title={holiday.name}
                        aria-label={holiday.name}
                      >
                        Holiday
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {view === "EMPLOYEE"
              ? employees.map((employee) => {
                  const employeeAllocations = allocations.filter(
                    (allocation) => allocation.resourceId === employee.id,
                  );
                  const workingDays = new Set(
                    employeeAllocations.map((allocation) => allocation.date),
                  ).size;
                  return (
                    <tr key={employee.id}>
                      <th scope="row" className="row-heading">
                        <div className="service-title">
                          <span
                            className={`avatar large ${avatarTone(employee.id)}`}
                          >
                            {initials(employee.name)}
                          </span>
                          <div>
                            <div className="service-name">
                              {cleanName(employee.name)}
                            </div>
                            <div className="service-meta">
                              {podMap.get(employee.podId)?.name.split(" (")[0]}
                            </div>
                            <div className="service-caption">
                              {workingDays} working days this month
                            </div>
                          </div>
                        </div>
                      </th>
                      {dates.map((date) => {
                        const dayAllocations = employeeAllocations.filter(
                          (allocation) => allocation.date === date,
                        );
                        const timeOff = dataset.leaves.find(
                          (leave) =>
                            leave.employeeId === employee.id &&
                            leave.leaveDate === date,
                        );
                        const issue = blockers.some(
                          (violation) =>
                            violation.date === date &&
                            violation.affectedResourceIds.includes(employee.id),
                        );
                        const holiday = dataset.publicHolidays.some(
                          (item) => item.holidayDate === date,
                        );
                        const label = issue
                          ? "Conflict"
                          : timeOff?.leaveType === "COMP_OFF"
                            ? "Comp-off"
                            : timeOff
                              ? "Leave"
                              : dayAllocations.length
                                ? "Working"
                                : holiday
                                  ? "Holiday"
                                  : "Off";
                        return (
                          <td key={date} className="schedule-cell">
                            {dayAllocations.length ? (
                              <button
                                className={`cell-button ${issue ? "issue" : ""}`}
                                aria-label={`Inspect ${cleanName(employee.name)} on ${date}`}
                                onClick={() =>
                                  onInspect(dayAllocations[0].slotId)
                                }
                              >
                                <span
                                  className={`employee-state ${issue ? "conflict" : "working"}`}
                                >
                                  {issue ? (
                                    <CircleAlert size={14} />
                                  ) : (
                                    <span className="status-dot green" />
                                  )}
                                  {label}
                                </span>
                              </button>
                            ) : (
                              <span
                                className={`employee-state ${timeOff ? "away" : ""}`}
                              >
                                {label}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              : services.map((service) => {
                  const brand = brandMap.get(service.brandId)!;
                  const process = processLabel(workspace, service);
                  const pod = podMap.get(brand.podId);
                  return (
                    <tr key={service.id}>
                      <th scope="row" className="row-heading">
                        <div className="service-title">
                          <span className="service-mark" aria-hidden="true">
                            {brand.name.charAt(0)}
                          </span>
                          <div>
                            <div className="service-name">{brand.name}</div>
                            <div className="service-meta">{process}</div>
                            <div className="service-caption">
                              {view === "POD"
                                ? pod?.name.split(" (")[0]
                                : `${service.minStaffing} required · ${Math.round(service.capacityWeight * 100)}% daily capacity`}
                            </div>
                          </div>
                        </div>
                      </th>
                      {dates.map((date) => {
                        const slotId = `${service.id}:${date}`;
                        const slot = slotMap.get(slotId);
                        const assigned = allocationsBySlot.get(slotId) ?? [];
                        const issue = blockers.some(
                          (violation) =>
                            violation.date === date &&
                            (violation.affectedServiceIds.includes(
                              service.id,
                            ) ||
                              assigned.some((allocation) =>
                                violation.affectedResourceIds.includes(
                                  allocation.resourceId,
                                ),
                              )),
                        );
                        if (!slot && assigned.length === 0)
                          return (
                            <td
                              key={date}
                              className="schedule-cell closed"
                              title="Service not operating on this date"
                            >
                              <span aria-label="Not operating">
                                <Minus
                                  size={14}
                                  style={{ display: "inline" }}
                                />
                              </span>
                            </td>
                          );
                        const covered = slot
                          ? coverageForSlot(problem, slot, allocations)
                          : 0;
                        const gap = !!slot && covered < slot.minResourceCount;
                        return (
                          <td key={date} className="schedule-cell">
                            <button
                              className={`cell-button ${gap ? "gap" : issue || !slot ? "issue" : ""}`}
                              aria-label={`Edit ${brand.name}, ${process}, ${date}`}
                              onClick={() => onInspect(slotId)}
                            >
                              {gap && (
                                <span className="allocation-person">
                                  <CircleAlert size={15} />
                                  <span>
                                    {density === "month"
                                      ? "Gap"
                                      : "Open coverage"}
                                  </span>
                                </span>
                              )}
                              {gap && density === "week" && (
                                <span className="gap-caption">
                                  {covered} of {slot?.minResourceCount} assigned
                                </span>
                              )}
                              {!slot && (
                                <span className="allocation-person">
                                  <CircleAlert size={15} />
                                  <span>Review work</span>
                                </span>
                              )}
                              {(!gap || assigned.length > 0) &&
                                assigned.slice(0, 3).map((allocation) => {
                                  const employee = resourceMap.get(
                                    allocation.resourceId,
                                  );
                                  return (
                                    <span
                                      className="allocation-person"
                                      key={allocation.id}
                                      title={`${employee?.name ?? "Unknown employee"}${allocation.isLocked ? " · pinned" : ""}`}
                                    >
                                      <span
                                        className={`avatar ${avatarTone(allocation.resourceId)}`}
                                        aria-hidden="true"
                                      >
                                        {initials(employee?.name ?? "?")}
                                      </span>
                                      <span>
                                        {shortName(employee?.name ?? "Unknown")}
                                      </span>
                                      {allocation.isLocked && (
                                        <LockKeyhole
                                          size={12}
                                          aria-label="Pinned"
                                        />
                                      )}
                                    </span>
                                  );
                                })}
                              {assigned.length > 3 && (
                                <span className="muted">
                                  +{assigned.length - 3} more
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
            {rowCount === 0 && (
              <tr>
                <td colSpan={dates.length + 1}>
                  <div className="empty-state">
                    No {view === "EMPLOYEE" ? "people" : "services"} match these
                    filters. Try a different search, pod or issue filter.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="roster-footer">
        <div className="legend">
          <span>
            <i className="legend-box" />
            Assigned
          </span>
          <span>
            <i className="legend-box open" />
            Open coverage
          </span>
          <span>
            <LockKeyhole size={13} />
            Pinned
          </span>
          <span>
            <Minus size={13} />
            Not operating
          </span>
        </div>
        <span>
          {rowCount} {view === "EMPLOYEE" ? "people" : "services"} ·{" "}
          {workspace.problem.horizon.timezone}
        </span>
      </div>
    </div>
  );
}
