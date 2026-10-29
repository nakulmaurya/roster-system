"use client";

import { useState } from "react";
import {
  RosterWorkspaceState,
  upsertAssignment,
  removeAssignment,
  addEmployeeLeave,
  removeEmployeeLeave,
  updateServiceRequirement,
  updateHoliday,
  addProcessToBrand,
} from "@/domain/roster/service";
import { dateLabel, serviceLabel, ServiceRecord } from "./roster/presentation";

export type OperationsSection =
  "assignments" | "availability" | "services" | "holidays" | "history";
export interface WorkspaceActionProps {
  workspace: RosterWorkspaceState;
  run: (
    action: () => RosterWorkspaceState,
    message?: string,
  ) => boolean | Promise<boolean>;
}
interface Props extends WorkspaceActionProps {
  section: OperationsSection;
}

export default function OperationsSettings({ workspace, run, section }: Props) {
  const { dataset } = workspace;
  const [employeeId, setEmployeeId] = useState(dataset.employees[0]?.id ?? "");
  const [serviceId, setServiceId] = useState(
    dataset.brandProcesses[0]?.id ?? "",
  );
  const [roleOverride, setRoleOverride] = useState<{
    pair: string;
    role: "PRIMARY" | "BACKUP" | "RELIEF";
  } | null>(null);
  const pair = JSON.stringify([employeeId, serviceId]);
  const currentRole =
    dataset.assignments.find(
      (assignment) =>
        assignment.employeeId === employeeId &&
        assignment.brandProcessId === serviceId,
    )?.role ?? "BACKUP";
  const role = roleOverride?.pair === pair ? roleOverride.role : currentRole;
  const [date, setDate] = useState(workspace.problem.horizon.startDate);
  const [leaveType, setLeaveType] = useState<"PLANNED" | "SICK" | "COMP_OFF">(
    "PLANNED",
  );
  const [holidayName, setHolidayName] = useState("");
  const selectedService = dataset.brandProcesses.find(
    (service) => service.id === serviceId,
  );
  const employeeSelect = (
    <label className="field">
      Employee
      <select
        aria-label="Manage employee"
        value={employeeId}
        onChange={(event) => {
          setEmployeeId(event.target.value);
          setRoleOverride(null);
        }}
      >
        {dataset.employees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.name}
          </option>
        ))}
      </select>
    </label>
  );
  const serviceSelect = (
    <label className="field">
      Brand & process
      <select
        aria-label="Manage brand process"
        value={serviceId}
        onChange={(event) => {
          setServiceId(event.target.value);
          setRoleOverride(null);
        }}
      >
        {dataset.brandProcesses.map((service) => (
          <option key={service.id} value={service.id}>
            {serviceLabel(workspace, service.id)}
          </option>
        ))}
      </select>
    </label>
  );
  const dateInput = (
    <label className="field">
      Date
      <input
        aria-label="Change date"
        type="date"
        min={workspace.problem.horizon.startDate}
        max={workspace.problem.horizon.endDate}
        value={date}
        onChange={(event) => setDate(event.target.value)}
      />
    </label>
  );

  if (section === "assignments")
    return (
      <div className="settings-stack">
        <div className="section-intro">
          <h3>Who can cover what</h3>
          <p>
            Eligibility is separate from the roster. Authorize a person before
            scheduling them for a service.
          </p>
        </div>
        {employeeSelect}
        {serviceSelect}
        <label className="field">
          Assignment role
          <select
            aria-label="Assignment role"
            value={role}
            onChange={(event) =>
              setRoleOverride({ pair, role: event.target.value as typeof role })
            }
          >
            <option value="PRIMARY">Primary</option>
            <option value="BACKUP">Backup</option>
            <option value="RELIEF">Relief</option>
          </select>
        </label>
        <div className="button-row">
          <button
            className="button button-primary"
            disabled={!employeeId || !serviceId}
            onClick={() =>
              run(
                () => upsertAssignment("default", employeeId, serviceId, role),
                "Eligibility saved. Existing work revalidated.",
              )
            }
          >
            Save eligibility
          </button>
          <button
            className="button button-danger-quiet"
            disabled={!employeeId || !serviceId}
            onClick={() =>
              run(
                () => removeAssignment("default", employeeId, serviceId),
                "Eligibility revoked. Affected allocations remain visible for review.",
              )
            }
          >
            Revoke eligibility
          </button>
        </div>
        <section className="form-section">
          <h3>Current eligibility</h3>
          {dataset.assignments.filter(
            (assignment) => assignment.employeeId === employeeId,
          ).length === 0 && (
            <p className="muted">
              No services authorized yet. This person will not be assigned
              automatically.
            </p>
          )}
          <div className="settings-list">
            {dataset.assignments
              .filter((assignment) => assignment.employeeId === employeeId)
              .map((assignment) => (
                <div key={assignment.id}>
                  <span>
                    {serviceLabel(workspace, assignment.brandProcessId)}
                  </span>
                  <span className="status-tag">
                    {assignment.role.toLowerCase()}
                  </span>
                </div>
              ))}
          </div>
        </section>
      </div>
    );

  if (section === "availability")
    return (
      <div className="settings-stack">
        <div className="section-intro">
          <h3>Time away from work</h3>
          <p>
            Record approved leave or comp-off. Unlocked work is removed; pinned
            work stays visible as a conflict.
          </p>
        </div>
        {employeeSelect}
        {dateInput}
        <label className="field">
          Time-off type
          <select
            aria-label="Leave type"
            value={leaveType}
            onChange={(event) =>
              setLeaveType(event.target.value as typeof leaveType)
            }
          >
            <option value="PLANNED">Planned leave</option>
            <option value="SICK">Sick leave</option>
            <option value="COMP_OFF">Approved comp-off</option>
          </select>
        </label>
        <button
          className="button button-primary"
          disabled={!employeeId || !date}
          onClick={() =>
            run(
              () => addEmployeeLeave("default", employeeId, date, leaveType),
              "Time off recorded. Coverage has been revalidated.",
            )
          }
        >
          Apply approved time off
        </button>
        <section className="form-section">
          <h3>Approved this month</h3>
          <div className="settings-list">
            {dataset.leaves
              .filter(
                (leave) =>
                  leave.employeeId === employeeId &&
                  leave.leaveDate >= workspace.problem.horizon.startDate &&
                  leave.leaveDate <= workspace.problem.horizon.endDate,
              )
              .map((leave) => (
                <div key={leave.id}>
                  <span>
                    {dateLabel(leave.leaveDate)} ·{" "}
                    {leave.leaveType.replace("_", " ").toLowerCase()}
                  </span>
                  <button
                    className="button button-quiet"
                    onClick={() =>
                      run(
                        () => removeEmployeeLeave("default", leave.id),
                        "Time off cancelled. Repair or regenerate to refill work.",
                      )
                    }
                  >
                    Cancel leave
                  </button>
                </div>
              ))}
          </div>
        </section>
      </div>
    );

  if (section === "services")
    return (
      <div className="settings-stack">
        <div className="section-intro">
          <h3>Operating requirements</h3>
          <p>
            Each service has its own calendar, capacity and minimum staffing.
            Edits preserve the roster and expose conflicts for review.
          </p>
        </div>
        {serviceSelect}
        {selectedService ? (
          <ServiceRules
            key={selectedService.id}
            workspace={workspace}
            run={run}
            service={selectedService}
          />
        ) : (
          <p className="empty-state">
            Add a brand before configuring its services.
          </p>
        )}
      </div>
    );

  if (section === "holidays")
    return (
      <div className="settings-stack">
        <div className="section-intro">
          <h3>Public holidays</h3>
          <p>
            Calendars decide whether a service closes on these dates. Sample
            dates are fictional, not an official holiday calendar.
          </p>
        </div>
        {dateInput}
        <label className="field">
          Holiday name
          <input
            aria-label="Holiday name"
            placeholder="e.g. Company holiday"
            value={holidayName}
            onChange={(event) => setHolidayName(event.target.value)}
          />
        </label>
        <button
          className="button button-primary"
          disabled={!date || !holidayName.trim()}
          onClick={() =>
            run(
              () => updateHoliday("default", date, holidayName),
              "Holiday saved. Operating calendars revalidated.",
            )
          }
        >
          Save holiday
        </button>
        <div className="settings-list">
          {dataset.publicHolidays
            .filter(
              (holiday) =>
                holiday.holidayDate >= workspace.problem.horizon.startDate &&
                holiday.holidayDate <= workspace.problem.horizon.endDate,
            )
            .map((holiday) => (
              <div key={holiday.id}>
                <span>
                  {dateLabel(holiday.holidayDate)} · {holiday.name}
                </span>
                <button
                  className="button button-quiet"
                  onClick={() =>
                    run(
                      () => updateHoliday("default", holiday.holidayDate),
                      "Holiday removed.",
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
        </div>
      </div>
    );

  return (
    <div className="settings-stack">
      <div className="section-intro">
        <h3>Published snapshots</h3>
        <p>
          Server-validated database snapshots preserve the rules, people and
          assignments at publication. Editing creates a new draft; existing
          history stays immutable. Publishing requires a manager session, not a
          multi-stage approval chain.
        </p>
      </div>
      {workspace.publications.length === 0 ? (
        <div className="empty-state">
          No published versions yet. Resolve mandatory issues, then publish your
          roster.
        </div>
      ) : (
        workspace.publications.map((snapshot) => (
          <div className="publication-item" key={snapshot.version}>
            <strong>Version {snapshot.version}</strong>
            <p>{new Date(snapshot.publishedAt).toLocaleString()}</p>
            <span className="muted">
              {snapshot.allocations.length} assignments preserved
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function ServiceRules({
  workspace,
  run,
  service,
}: WorkspaceActionProps & { service: ServiceRecord }) {
  const { dataset } = workspace;
  const [calendarId, setCalendarId] = useState(service.calendarId);
  const toTime = (minute: number) =>
    `${String(Math.floor((minute % 1440) / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const [shiftStart, setShiftStart] = useState(
    toTime(service.shift?.startMinute ?? 0),
  );
  const [shiftEnd, setShiftEnd] = useState(
    toTime(service.shift?.endMinute ?? 1440),
  );
  const [shiftTimezone, setShiftTimezone] = useState(
    service.shift?.timezone ?? "Asia/Kolkata",
  );
  const fromTime = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  };
  const [minimum, setMinimum] = useState(service.minStaffing);
  const [capacity, setCapacity] = useState(service.capacityWeight);
  const [duties, setDuties] = useState(
    service.coveredProcessIds ?? [service.processId],
  );
  const [date, setDate] = useState(workspace.problem.horizon.startDate);
  const [overrideAction, setOverrideAction] = useState<"ADD" | "REMOVE">("ADD");
  const [overrideStaffing, setOverrideStaffing] = useState(1);
  const [brandId, setBrandId] = useState(dataset.brands[0]?.id ?? "");
  const [processId, setProcessId] = useState(dataset.processes[0]?.id ?? "");
  return (
    <>
      <form
        className="form-section"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () =>
              updateServiceRequirement("default", service.id, {
                calendarId,
                minStaffing: minimum,
                capacityWeight: capacity,
                coveredProcessIds: duties,
                shift: {
                  startMinute: fromTime(shiftStart),
                  endMinute: fromTime(shiftEnd) || 1440,
                  timezone: shiftTimezone,
                },
              }),
            "Service requirements saved. Existing work has been revalidated.",
          );
        }}
      >
        <label className="field">
          Operating calendar
          <select
            aria-label="Service operating calendar"
            value={calendarId}
            onChange={(event) => setCalendarId(event.target.value)}
          >
            {dataset.calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label className="field">
            Minimum distinct staff
            <input
              aria-label="Minimum distinct staff"
              type="number"
              min="0"
              max="2000"
              required
              value={minimum}
              onChange={(event) => setMinimum(Number(event.target.value))}
            />
          </label>
          <label className="field">
            Capacity per person
            <input
              aria-label="Daily capacity per person"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={capacity}
              onChange={(event) => setCapacity(Number(event.target.value))}
            />
          </label>
        </div>
        <fieldset>
          <legend>Working interval</legend>
          <p className="muted">
            End at or before start means the following day. Equal times mean a
            full 24-hour interval. Overlapping duties require different people
            or one explicitly compatible bundle.
          </p>
          <div className="form-grid">
            <label className="field">
              Shift starts
              <input
                aria-label="Shift starts"
                type="time"
                required
                value={shiftStart}
                onChange={(event) => setShiftStart(event.target.value)}
              />
            </label>
            <label className="field">
              Shift ends
              <input
                aria-label="Shift ends"
                type="time"
                required
                value={shiftEnd}
                onChange={(event) => setShiftEnd(event.target.value)}
              />
            </label>
          </div>
          <label className="field">
            Shift timezone
            <select
              aria-label="Shift timezone"
              value={shiftTimezone}
              onChange={(event) => setShiftTimezone(event.target.value)}
            >
              <option value="Asia/Kolkata">Asia/Kolkata (India)</option>
              <option value="UTC">UTC</option>
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>Compatible duties</legend>
          <p className="muted">
            One allocation covers these duties using the same calendar and
            configured capacity.
          </p>
          {dataset.processes.map((process) => (
            <label className="checkbox-field" key={process.id}>
              <input
                type="checkbox"
                disabled={process.id === service.processId}
                checked={duties.includes(process.id)}
                onChange={(event) =>
                  setDuties(
                    event.target.checked
                      ? [...duties, process.id]
                      : duties.filter((id) => id !== process.id),
                  )
                }
              />
              {process.name}
            </label>
          ))}
        </fieldset>
        <button className="button button-primary" type="submit">
          Save service rules
        </button>
      </form>
      <section className="form-section">
        <h3>Date-specific exceptions</h3>
        <label className="field">
          Exception date
          <input
            aria-label="Change date"
            type="date"
            min={workspace.problem.horizon.startDate}
            max={workspace.problem.horizon.endDate}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label className="field">
          Operating exception
          <select
            aria-label="Date operating override"
            value={overrideAction}
            onChange={(event) =>
              setOverrideAction(event.target.value as typeof overrideAction)
            }
          >
            <option value="ADD">Open on this date</option>
            <option value="REMOVE">Close on this date</option>
          </select>
        </label>
        <button
          className="button"
          disabled={!date}
          onClick={() =>
            run(
              () =>
                updateServiceRequirement("default", service.id, {
                  calendarOverrides: [
                    ...(service.calendarOverrides ?? []).filter(
                      (override) => override.date !== date,
                    ),
                    { date, action: overrideAction },
                  ],
                }),
              "Operating exception saved.",
            )
          }
        >
          Set operating override
        </button>
        <label className="field">
          Staff required on this date
          <input
            aria-label="Date-specific staffing"
            type="number"
            min="0"
            max="2000"
            value={overrideStaffing}
            onChange={(event) =>
              setOverrideStaffing(Number(event.target.value))
            }
          />
        </label>
        <button
          className="button"
          disabled={!date}
          onClick={() =>
            run(
              () =>
                updateServiceRequirement("default", service.id, {
                  staffingOverrides: [
                    ...(service.staffingOverrides ?? []).filter(
                      (override) => override.date !== date,
                    ),
                    { date, minStaffing: overrideStaffing },
                  ],
                }),
              "Staffing exception saved.",
            )
          }
        >
          Set staffing override
        </button>
        <div className="settings-list">
          {(service.calendarOverrides ?? []).map((override) => (
            <div key={`calendar-${override.date}`}>
              <span>
                {dateLabel(override.date)} ·{" "}
                {override.action === "ADD" ? "Open" : "Closed"}
              </span>
              <button
                className="button button-quiet"
                onClick={() =>
                  run(
                    () =>
                      updateServiceRequirement("default", service.id, {
                        calendarOverrides: service.calendarOverrides?.filter(
                          (item) => item.date !== override.date,
                        ),
                      }),
                    "Operating exception removed.",
                  )
                }
              >
                Remove
              </button>
            </div>
          ))}
          {(service.staffingOverrides ?? []).map((override) => (
            <div key={`staffing-${override.date}`}>
              <span>
                {dateLabel(override.date)} · {override.minStaffing} staff
              </span>
              <button
                className="button button-quiet"
                onClick={() =>
                  run(
                    () =>
                      updateServiceRequirement("default", service.id, {
                        staffingOverrides: service.staffingOverrides?.filter(
                          (item) => item.date !== override.date,
                        ),
                      }),
                    "Staffing exception removed.",
                  )
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="form-section">
        <h3>Add a separate process requirement</h3>
        <p className="muted">
          Remove a duty from its existing bundle before adding it separately.
          New requirements need explicit employee eligibility.
        </p>
        <label className="field">
          Brand
          <select
            aria-label="New process brand"
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
          >
            {dataset.brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Process
          <select
            aria-label="New process type"
            value={processId}
            onChange={(event) => setProcessId(event.target.value)}
          >
            {dataset.processes.map((process) => (
              <option key={process.id} value={process.id}>
                {process.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button"
          disabled={!brandId || !processId}
          onClick={() =>
            run(
              () =>
                addProcessToBrand("default", {
                  brandId,
                  processId,
                  calendarId: service.calendarId,
                  minStaffing: 1,
                  capacityWeight: service.capacityWeight,
                }),
              "Process requirement added. Configure eligibility before generating work.",
            )
          }
        >
          Add process requirement
        </button>
      </section>
    </>
  );
}
