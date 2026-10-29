"use client";

import { useCallback, useState } from "react";
import {
  CalendarDays,
  LayoutGrid,
  UsersRound,
  ShieldCheck,
  Settings2,
  FlaskConical,
  CircleHelp,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Download,
  Upload,
  FileJson,
  Table2,
  RefreshCw,
  CircleAlert,
  Check,
  X,
  Search,
  Building2,
  Layers3,
  Menu,
  Database,
  LogOut,
  ArrowUpRight,
  ListFilter,
  GitCompareArrows,
} from "lucide-react";
import {
  addEmployeeLeave,
  autoRepairAllGaps,
  changeWorkspacePeriod,
  exportRosterToCsv,
  generateWorkspaceRoster,
  getDiffSummary,
  publishRoster,
} from "@/domain/roster/service";
import { useRosterWorkspace, downloadText } from "@/hooks/useRosterWorkspace";
import Dialog from "./roster/Dialog";
import AccessGate from "./roster/AccessGate";
import RosterTable from "./roster/RosterTable";
import SlotInspector from "./roster/SlotInspector";
import WorkspaceSettings, { SettingsTab } from "./roster/WorkspaceSettings";
import {
  allDates,
  cleanName,
  dateLabel,
  periodValue,
  serviceLabel,
  CalendarDensity,
  RosterView,
} from "./roster/presentation";

const viewTabs: Array<{
  id: RosterView;
  label: string;
  icon: typeof Building2;
}> = [
  { id: "BRAND", label: "By brand", icon: Building2 },
  { id: "EMPLOYEE", label: "By person", icon: UsersRound },
  { id: "POD", label: "By pod", icon: Layers3 },
  { id: "PROCESS", label: "By process", icon: ListFilter },
];
type Page = "roster" | "coverage" | "people";
type OpenDialog =
  "settings" | "slot" | "changes" | "demo" | "about" | "navigation" | null;

export default function RosterDashboard() {
  const controller = useRosterWorkspace();
  const { workspace, run, notice, setNotice, saveState } = controller;
  const [page, setPage] = useState<Page>("roster");
  const [view, setView] = useState<RosterView>("BRAND");
  const [density, setDensity] = useState<CalendarDensity>("week");
  const [week, setWeek] = useState(0);
  const [podId, setPodId] = useState("ALL");
  const [processId, setProcessId] = useState("ALL");
  const [model, setModel] = useState("ALL");
  const [query, setQuery] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [includePreferences, setIncludePreferences] = useState(false);
  const [issueLimit, setIssueLimit] = useState(20);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  const openDialog = useCallback((next: Exclude<OpenDialog, null>) => {
    const active = document.activeElement as HTMLElement | null;
    setReturnFocus((previous) =>
      active?.closest('[role="dialog"]') ? previous : active,
    );
    setDialog(next);
  }, []);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("rules");
  const [slotId, setSlotId] = useState("");
  const [inspectorTitle, setInspectorTitle] = useState("Assignment details");
  const closeDialog = useCallback(() => setDialog(null), []);

  if (!controller.authenticated || !workspace)
    return (
      <AccessGate
        loading={controller.loading}
        busy={controller.busy}
        error={controller.authError}
        tryDemo={controller.tryDemo}
        signIn={controller.signIn}
      />
    );

  const dates = allDates(workspace);
  const weekCount = Math.ceil(dates.length / 7);
  const safeWeek = Math.min(week, weekCount - 1);
  const visibleDates =
    density === "month" ? dates : dates.slice(safeWeek * 7, safeWeek * 7 + 7);
  const month = periodValue(workspace);
  const monthLabel = dateLabel(dates[0], { month: "long", year: "numeric" });
  const blockers = workspace.violations.filter(
    (violation) => violation.severity === "BLOCKER",
  );
  const warnings = workspace.violations.filter(
    (violation) => violation.severity === "WARNING",
  );
  const gaps = blockers.filter(
    (violation) => violation.ruleCode === "H4_MINIMUM_COVERAGE",
  );
  const pins = workspace.allocations.filter(
    (allocation) => allocation.isLocked,
  ).length;
  const differences = getDiffSummary("default");
  const displayedView = page === "people" ? "EMPLOYEE" : view;
  const openSettings = (tab: SettingsTab = "rules") => {
    setNotice(null);
    setSettingsTab(tab);
    openDialog("settings");
  };
  const inspect = (id: string) => {
    setNotice(null);
    setSlotId(id);
    const serviceId =
      workspace.problem.demandSlots.find((slot) => slot.id === id)?.serviceId ??
      workspace.allocations.find((allocation) => allocation.slotId === id)
        ?.serviceId;
    setInspectorTitle(
      serviceId ? serviceLabel(workspace, serviceId) : "Assignment details",
    );
    openDialog("slot");
  };
  const changeMonth = async (value: string) => {
    if (!/^\d{4}-\d{2}$/.test(value)) return;
    const [year, nextMonth] = value.split("-").map(Number);
    if (
      await run(
        () => changeWorkspacePeriod("default", { year, month: nextMonth }),
        "Month opened. Other monthly drafts are preserved.",
      )
    )
      setWeek(0);
  };
  const navigate = (next: Page) => {
    setPage(next);
    setQuery("");
    setOnlyIssues(false);
    closeDialog();
  };
  const publish = () =>
    run(() => {
      const result = publishRoster("default");
      if (!result.success) throw new Error(result.message);
      return result.state;
    }, `Version ${workspace.version} published after server validation.`);
  const repair = async () => {
    let count = 0;
    const success = await run(() => {
      const result = autoRepairAllGaps("default");
      count = result.repairedCount;
      return result.state;
    });
    if (success)
      setNotice({
        kind: count ? "success" : "info",
        message: count
          ? `${count} eligible assignment${count === 1 ? "" : "s"} added and pinned. Remaining issues still need review.`
          : "No safe direct gap fills were found. Review available people, pins and requirements.",
      });
  };
  const simulateLeave = async (multi: boolean) => {
    const allocation = workspace.allocations.find((item) => {
      const slot = workspace.problem.demandSlots.find(
        (demand) => demand.id === item.slotId,
      );
      const service = workspace.dataset.brandProcesses.find(
        (candidate) => candidate.id === item.serviceId,
      );
      const brand = workspace.dataset.brands.find(
        (candidate) => candidate.id === service?.brandId,
      );
      return (
        !item.isLocked &&
        slot &&
        (multi
          ? slot.minResourceCount > 1
          : brand?.staffingModel === "SINGLE" &&
            workspace.dataset.assignments.some(
              (assignment) =>
                assignment.employeeId === item.resourceId &&
                assignment.brandProcessId === item.serviceId &&
                assignment.role === "PRIMARY",
            )) &&
        !workspace.problem.unavailabilities.some(
          (unavailable) =>
            unavailable.resourceId === item.resourceId &&
            unavailable.date === item.date,
        )
      );
    });
    if (!allocation)
      return setNotice({
        kind: "info",
        message:
          "There is no suitable unlocked working day for this scenario in the active month.",
      });
    if (
      await run(
        () =>
          addEmployeeLeave(
            "default",
            allocation.resourceId,
            allocation.date,
            multi ? "PLANNED" : "SICK",
          ),
        `Time off added on ${allocation.date}. Affected unlocked work was removed and coverage revalidated.`,
      )
    ) {
      setPage("coverage");
      closeDialog();
    }
  };

  const sidebar = (
    <>
      <div className="workspace-brand">
        <span className="app-mark">
          <LayoutGrid size={20} />
        </span>
        <div>
          Roster Studio<p>DATASTRAW</p>
        </div>
      </div>
      <div className="sidebar-caption">Workspace</div>
      <nav className="sidebar-nav" aria-label="Workspace navigation">
        <button
          className={`nav-item ${page === "roster" ? "active" : ""}`}
          aria-current={page === "roster" ? "page" : undefined}
          onClick={() => navigate("roster")}
        >
          <CalendarDays size={18} />
          Roster
        </button>
        <button
          className={`nav-item ${page === "coverage" ? "active" : ""}`}
          aria-current={page === "coverage" ? "page" : undefined}
          onClick={() => navigate("coverage")}
        >
          <ShieldCheck size={18} />
          Coverage
          <span className={`nav-count ${blockers.length ? "risk" : ""}`}>
            {blockers.length}
          </span>
        </button>
        <button
          className={`nav-item ${page === "people" ? "active" : ""}`}
          aria-current={page === "people" ? "page" : undefined}
          onClick={() => navigate("people")}
        >
          <UsersRound size={18} />
          People
          <span className="nav-count">
            {workspace.dataset.employees.length}
          </span>
        </button>
      </nav>
      <div className="sidebar-bottom">
        <button className="nav-item" onClick={() => openSettings()}>
          <Settings2 size={18} />
          Workspace settings
        </button>
        <button className="nav-item" onClick={() => openDialog("demo")}>
          <FlaskConical size={18} />
          Demo scenarios
        </button>
        <button className="nav-item" onClick={() => openDialog("about")}>
          <CircleHelp size={18} />
          About this workspace
        </button>
        <div className="local-workspace">
          <span className="status-dot green" />
          Database workspace
        </div>
      </div>
    </>
  );

  return (
    <div className="app-shell">
      <aside className="workspace-sidebar" inert={!!dialog}>
        {sidebar}
      </aside>
      <div className="app-content" inert={!!dialog}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-nav-trigger"
              aria-label="Open navigation"
              onClick={() => openDialog("navigation")}
            >
              <Menu size={20} />
            </button>
            <span className="desktop-crumb">DATASTRAW</span>
            <ChevronRight className="desktop-crumb" size={14} />
            <span className="desktop-crumb">Operations</span>
            <ChevronRight className="desktop-crumb" size={14} />
            <strong>
              {page === "roster"
                ? "Roster"
                : page === "people"
                  ? "People"
                  : "Coverage"}
            </strong>
          </div>
          <div className="save-label">
            <Database size={15} />
            <span>
              {saveState === "saved"
                ? controller.busy
                  ? "Saving…"
                  : "Saved to database"
                : saveState === "memory"
                  ? "Not saved"
                  : "Storage needs attention"}
            </span>
            <span className="save-detail">
              ·{" "}
              {controller.sessionKind === "demo"
                ? "Isolated demo"
                : "Managed workspace"}{" "}
              · {controller.role}
            </span>
            <button
              className="icon-button"
              aria-label="Sign out"
              title="Sign out"
              onClick={() => void controller.signOut()}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <main className="main-content" aria-busy={controller.busy}>
          {controller.role === "viewer" && (
            <div className="notice info" role="status">
              Read-only workspace. A manager account is required to change or
              publish rosters.
            </div>
          )}
          {controller.busy && (
            <div className="save-progress" role="status">
              Saving and validating on the server…
            </div>
          )}
          {notice && (
            <div
              className={`notice ${notice.kind}`}
              role={notice.kind === "error" ? "alert" : "status"}
            >
              {notice.kind === "error" ? (
                <CircleAlert size={18} />
              ) : (
                <Check size={18} />
              )}
              <span>{notice.message}</span>
              <button
                className="icon-button"
                aria-label="Dismiss notification"
                onClick={() => setNotice(null)}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {(saveState === "conflict" ||
            saveState === "recovery" ||
            saveState === "memory") && (
            <section className="storage-banner" role="alert">
              <p>
                {saveState === "conflict"
                  ? "A newer database revision exists. Reload before editing to avoid overwriting another manager’s changes."
                  : saveState === "recovery"
                    ? "Your saved data could not be restored. It has not been overwritten. Export the original before resetting or restoring a backup."
                    : "Changes currently exist in memory only. Browser storage is unavailable or full; export a backup before leaving."}
              </p>
              <div className="button-row">
                {saveState === "conflict" && (
                  <button
                    className="button"
                    onClick={controller.acceptExternal}
                  >
                    Load latest changes
                  </button>
                )}
                <button className="button" onClick={controller.backup}>
                  Export this workspace
                </button>
                {saveState === "recovery" && (
                  <>
                    <button
                      className="button"
                      onClick={controller.recoveryBackup}
                    >
                      Download original data
                    </button>
                    <button
                      className="button button-danger-quiet"
                      onClick={controller.reset}
                    >
                      Reset demo
                    </button>
                  </>
                )}
              </div>
            </section>
          )}
          <div className="page-heading">
            <div>
              <div className="heading-eyebrow">
                <CalendarDays size={16} />
                Operations planning
                <span
                  className={`status-tag ${workspace.status.toLowerCase()}`}
                >
                  {workspace.status === "PUBLISHED" ? "Published" : "Draft"} · v
                  {workspace.version}
                </span>
              </div>
              <h1 tabIndex={-1} data-dialog-fallback>
                {page === "roster"
                  ? "Roster"
                  : page === "people"
                    ? "People & schedules"
                    : "Coverage review"}
              </h1>
              <p>
                {page === "roster"
                  ? "The right people, in the right place. One clear plan."
                  : page === "people"
                    ? "Working days, time off and individual schedules."
                    : "Understand the gaps before your roster goes live."}
              </p>
            </div>
            <div className="heading-actions">
              <details className="menu">
                <summary className="button">
                  <Download size={16} />
                  Export
                  <ChevronDown size={14} />
                </summary>
                <div className="menu-panel">
                  <button
                    onClick={() =>
                      downloadText(
                        exportRosterToCsv("default"),
                        `roster-${month}.csv`,
                        "text/csv;charset=utf-8;",
                      )
                    }
                  >
                    <Table2 size={16} />
                    Download CSV
                  </button>
                  <button onClick={controller.backup}>
                    <FileJson size={16} />
                    Backup JSON
                  </button>
                  <label>
                    <Upload size={16} />
                    Restore JSON
                    <input
                      className="sr-input"
                      aria-label="Restore JSON backup"
                      type="file"
                      accept="application/json,.json"
                      onChange={(event) => {
                        void controller.restore(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </details>
              <button
                className="button button-primary"
                disabled={controller.busy || controller.role === "viewer"}
                onClick={() =>
                  run(
                    () => generateWorkspaceRoster(),
                    "Roster generated. Pinned assignments were preserved.",
                  )
                }
              >
                <RefreshCw size={16} />
                Generate roster
              </button>
              <button
                className="button"
                disabled={
                  controller.busy ||
                  controller.role === "viewer" ||
                  blockers.length > 0 ||
                  workspace.status === "PUBLISHED"
                }
                title={
                  blockers.length
                    ? "Resolve all mandatory issues before publishing"
                    : "Validate and preserve this version on the server"
                }
                onClick={publish}
              >
                <ArrowUpRight size={16} />
                {workspace.status === "PUBLISHED" ? "Published" : "Publish"}
              </button>
            </div>
          </div>
          <section
            className="metrics-strip"
            aria-label="Monthly roster summary"
          >
            <div>
              <div className="metric-label">Coverage this month</div>
              <div className="metric-value">
                {(workspace.coverageRate * 100).toFixed(1)}%
                <span className="metric-secondary">
                  {workspace.fulfilledSlots} / {workspace.totalSlots}{" "}
                  requirements
                </span>
              </div>
            </div>
            <div>
              <div className="metric-label">People scheduled</div>
              <div className="metric-value">
                {
                  new Set(
                    workspace.allocations.map(
                      (allocation) => allocation.resourceId,
                    ),
                  ).size
                }
                <span className="metric-secondary">
                  of {workspace.dataset.employees.length} people
                </span>
              </div>
            </div>
            <div>
              <div className="metric-label">Brands & pods</div>
              <div className="metric-value">
                {workspace.dataset.brands.length}
                <span className="metric-secondary">
                  across {workspace.dataset.pods.length} pods
                </span>
              </div>
            </div>
            <div>
              <div className="metric-label">Mandatory issues</div>
              <div className={`metric-value ${blockers.length ? "risk" : ""}`}>
                {blockers.length}
                <span className="metric-secondary">
                  {gaps.length} coverage gap{gaps.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </section>
          {page !== "coverage" && (
            <section
              className={`coverage-callout ${blockers.length ? "" : "good"}`}
            >
              <span>
                {blockers.length ? (
                  <CircleAlert size={18} />
                ) : (
                  <ShieldCheck size={18} />
                )}
              </span>
              <div className="callout-copy">
                <strong>
                  {blockers.length
                    ? `${blockers.length} ${blockers.length === 1 ? "issue needs" : "issues need"} a closer look`
                    : "Ready for your final review"}
                </strong>
                <p>
                  {blockers.length
                    ? "Review coverage and mandatory rules before publishing."
                    : "Mandatory checks passed. Preferences may still need your judgment."}
                </p>
              </div>
              <button
                className="button button-quiet"
                onClick={() => navigate("coverage")}
              >
                {blockers.length ? "Review issues" : "View checks"}
                <ChevronRight size={16} />
              </button>
            </section>
          )}

          {page === "coverage" ? (
            <>
              <div className="roster-toolbar">
                <div>
                  <h2>Monthly issues</h2>
                  <p className="muted">
                    {monthLabel} · {blockers.length} mandatory ·{" "}
                    {warnings.length} preference notices
                  </p>
                </div>
                <div className="button-row">
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={includePreferences}
                      onChange={(event) => {
                        setIncludePreferences(event.target.checked);
                        setIssueLimit(20);
                      }}
                    />
                    Include preferences
                  </label>
                  <button
                    className="button"
                    disabled={!gaps.length}
                    onClick={repair}
                  >
                    <RefreshCw size={15} />
                    Fill eligible gaps
                  </button>
                </div>
              </div>
              <div className="coverage-list">
                {(includePreferences ? workspace.violations : blockers)
                  .slice(0, issueLimit)
                  .map((issue) => {
                    const directSlot = workspace.problem.demandSlots.find(
                      (slot) =>
                        slot.date === issue.date &&
                        issue.affectedServiceIds.includes(slot.serviceId),
                    );
                    const relatedAllocation = workspace.allocations.find(
                      (allocation) =>
                        allocation.date === issue.date &&
                        (issue.affectedServiceIds.includes(
                          allocation.serviceId,
                        ) ||
                          issue.affectedResourceIds.includes(
                            allocation.resourceId,
                          )),
                    );
                    const inspectId =
                      directSlot?.id ?? relatedAllocation?.slotId;
                    const title = issue.affectedServiceIds[0]
                      ? serviceLabel(workspace, issue.affectedServiceIds[0])
                      : issue.affectedResourceIds[0]
                        ? cleanName(
                            workspace.dataset.employees.find(
                              (employee) =>
                                employee.id === issue.affectedResourceIds[0],
                            )?.name ?? "Employee schedule",
                          )
                        : "Schedule configuration";
                    return (
                      <article className="coverage-list-item" key={issue.id}>
                        <span className="issue-icon">
                          <CircleAlert size={18} />
                        </span>
                        <div className="issue-copy">
                          <h3>{title}</h3>
                          <p>{issue.message}</p>
                          <div className="issue-meta">
                            <span>{dateLabel(issue.date)}</span>
                            <span
                              className={`status-tag ${issue.severity === "BLOCKER" ? "blocker" : "warning"}`}
                            >
                              {issue.severity === "BLOCKER"
                                ? "Mandatory"
                                : "Preference"}
                            </span>
                          </div>
                        </div>
                        <button
                          className="button"
                          onClick={() =>
                            inspectId
                              ? inspect(inspectId)
                              : openSettings("services")
                          }
                        >
                          {inspectId ? "Review assignment" : "Review rules"}
                          <ChevronRight size={15} />
                        </button>
                      </article>
                    );
                  })}
                {!(includePreferences ? workspace.violations : blockers)
                  .length && (
                  <div className="empty-state">
                    <ShieldCheck
                      size={26}
                      style={{ margin: "0 auto 12px", color: "var(--green)" }}
                    />
                    <h3>All mandatory checks passed</h3>
                    <p>
                      You can publish a snapshot when you are satisfied with the
                      plan.
                    </p>
                  </div>
                )}
              </div>
              {(includePreferences ? workspace.violations : blockers).length >
                issueLimit && (
                <button
                  className="button"
                  style={{ marginTop: 16 }}
                  onClick={() => setIssueLimit(issueLimit + 20)}
                >
                  Show 20 more
                </button>
              )}
            </>
          ) : (
            <>
              {page === "roster" && (
                <nav className="view-tabs" aria-label="Roster views">
                  {viewTabs.map((tab) => (
                    <button
                      className="view-tab"
                      key={tab.id}
                      aria-pressed={view === tab.id}
                      onClick={() => setView(tab.id)}
                    >
                      <tab.icon size={16} />
                      {tab.label}
                    </button>
                  ))}
                </nav>
              )}
              <div className="roster-toolbar">
                <div className="calendar-tools">
                  <input
                    aria-label="Roster month"
                    className="month-input"
                    type="month"
                    min="2000-01"
                    max="2100-12"
                    value={month}
                    onChange={(event) => changeMonth(event.target.value)}
                  />
                  <button
                    className="icon-button"
                    disabled={density === "month" || safeWeek === 0}
                    aria-label="Previous seven days"
                    onClick={() => setWeek(safeWeek - 1)}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={density === "month" || safeWeek >= weekCount - 1}
                    aria-label="Next seven days"
                    onClick={() => setWeek(safeWeek + 1)}
                  >
                    <ChevronRight size={18} />
                  </button>
                  <span className="calendar-range">
                    {dateLabel(visibleDates[0])}–
                    {dateLabel(visibleDates.at(-1)!)}
                  </span>
                </div>
                <div className="segmented" aria-label="Calendar range">
                  <button
                    aria-pressed={density === "week"}
                    onClick={() => setDensity("week")}
                  >
                    Week
                  </button>
                  <button
                    aria-pressed={density === "month"}
                    onClick={() => setDensity("month")}
                  >
                    Month
                  </button>
                </div>
                <div className="filter-tools">
                  <select
                    aria-label="Pod filter"
                    className="filter-select"
                    value={podId}
                    onChange={(event) => setPodId(event.target.value)}
                  >
                    <option value="ALL">All pods</option>
                    {workspace.dataset.pods.map((pod) => (
                      <option key={pod.id} value={pod.id}>
                        {pod.name}
                      </option>
                    ))}
                  </select>
                  {displayedView === "PROCESS" ? (
                    <select
                      aria-label="Process filter"
                      className="filter-select"
                      value={processId}
                      onChange={(event) => setProcessId(event.target.value)}
                    >
                      <option value="ALL">All processes</option>
                      {workspace.dataset.processes.map((process) => (
                        <option key={process.id} value={process.id}>
                          {process.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    displayedView !== "EMPLOYEE" && (
                      <select
                        aria-label="Staffing model filter"
                        className="filter-select"
                        value={model}
                        onChange={(event) => setModel(event.target.value)}
                      >
                        <option value="ALL">All staffing models</option>
                        <option value="SINGLE">Single primary</option>
                        <option value="MULTI">Multiple resources</option>
                      </select>
                    )
                  )}
                  <label className="search-field">
                    <Search size={16} />
                    <input
                      aria-label="Search roster"
                      placeholder={
                        displayedView === "EMPLOYEE"
                          ? "Search people…"
                          : "Search brands…"
                      }
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                  <button
                    className={`button ${onlyIssues ? "" : "button-quiet"}`}
                    aria-pressed={onlyIssues}
                    onClick={() => setOnlyIssues(!onlyIssues)}
                  >
                    <ListFilter size={15} />
                    Issues only
                  </button>
                  <button
                    className="button button-quiet"
                    onClick={() => openDialog("changes")}
                  >
                    <GitCompareArrows size={15} />
                    Changes
                    {differences.length ? ` (${differences.length})` : ""}
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Configure roster"
                    onClick={() => openSettings()}
                  >
                    <Settings2 size={17} />
                  </button>
                </div>
              </div>
              <RosterTable
                workspace={workspace}
                dates={visibleDates}
                density={density}
                view={displayedView}
                podId={podId}
                processId={processId}
                model={model}
                query={query}
                onlyIssues={onlyIssues}
                onInspect={inspect}
              />
              <p className="muted" style={{ marginTop: 16 }}>
                Coverage & shift planning · {pins} pinned assignment
                {pins === 1 ? "" : "s"} · Click any working cell to review or
                make a change.
              </p>
            </>
          )}
        </main>
      </div>

      {dialog && (
        <Dialog
          key={dialog}
          returnFocus={returnFocus}
          onClose={closeDialog}
          wide={dialog === "settings" || dialog === "changes"}
          title={
            dialog === "settings"
              ? "Workspace settings"
              : dialog === "slot"
                ? inspectorTitle
                : dialog === "changes"
                  ? "Changes to this roster"
                  : dialog === "demo"
                    ? "Explore a real scheduling change"
                    : dialog === "navigation"
                      ? "Your workspace"
                      : "About this workspace"
          }
          description={
            dialog === "settings"
              ? "People, eligibility and operational requirements. All changes are validated."
              : undefined
          }
        >
          {notice && (
            <div
              className={`notice ${notice.kind}`}
              role={notice.kind === "error" ? "alert" : "status"}
            >
              <span>{notice.message}</span>
              <button
                className="icon-button"
                aria-label="Dismiss dialog notification"
                onClick={() => setNotice(null)}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {dialog === "settings" && (
            <WorkspaceSettings
              workspace={workspace}
              run={run}
              tab={settingsTab}
              onTabChange={setSettingsTab}
            />
          )}
          {dialog === "slot" && (
            <SlotInspector
              key={slotId}
              workspace={workspace}
              run={run}
              slotId={slotId}
            />
          )}
          {dialog === "navigation" && (
            <div className="sidebar-nav">{sidebar}</div>
          )}
          {dialog === "changes" && (
            <div className="review-list">
              <p className="muted">
                Compared with{" "}
                {workspace.publications.length
                  ? "the latest published snapshot"
                  : "the initial generated baseline"}
                .
              </p>
              {differences.length ? (
                differences.map((difference, index) => (
                  <article
                    className="review-item"
                    key={`${difference.date}:${difference.brandName}:${index}`}
                  >
                    <div className="button-row">
                      <strong>{difference.brandName}</strong>
                      <span className="status-tag">
                        {difference.changeType.toLowerCase()}
                      </span>
                    </div>
                    <p>
                      {dateLabel(difference.date)} ·{" "}
                      {difference.newEmployeeName}
                    </p>
                    <span className="muted">{difference.reason}</span>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  No changes from the current baseline.
                </div>
              )}
            </div>
          )}
          {dialog === "demo" && (
            <div className="settings-stack">
              <p className="muted">
                These scenarios use an actual unlocked working day in the
                selected month. Changes are saved to this database workspace.
              </p>
              <section className="form-section">
                <h3>The only primary employee calls in sick</h3>
                <p className="muted">
                  See the coverage impact on a single-primary brand, then review
                  eligible replacements.
                </p>
                <button className="button" onClick={() => simulateLeave(false)}>
                  Simulate sole-primary sick leave
                  <ChevronRight size={15} />
                </button>
              </section>
              <section className="form-section">
                <h3>A multi-person service loses a team member</h3>
                <p className="muted">
                  Check whether remaining staffing still satisfies the process
                  requirement.
                </p>
                <button className="button" onClick={() => simulateLeave(true)}>
                  Simulate multi-staff leave
                  <ChevronRight size={15} />
                </button>
              </section>
              <section className="form-section">
                <h3>Start fresh</h3>
                <p className="muted">
                  Reset the active month to its fictional sample data. Export a
                  backup before discarding changes.
                </p>
                <button
                  className="button button-danger-quiet"
                  onClick={() => {
                    void controller.reset().then((success) => {
                      if (success) closeDialog();
                    });
                  }}
                >
                  Reset active month
                </button>
              </section>
            </div>
          )}
          {dialog === "about" && (
            <div className="settings-stack">
              <div className="section-intro">
                <h3>A focused operations workspace</h3>
                <p>
                  A reusable TypeScript scheduling engine, with brands,
                  processes and pods as its first application.
                </p>
              </div>
              <section className="form-section">
                <h3>What is saved</h3>
                <p className="muted">
                  Drafts and published snapshots are stored centrally in
                  PostgreSQL. Managed accounts share their configured workspace;
                  each public demo session is isolated. Export JSON backups for
                  portability. Demo workspaces expire automatically.
                </p>
              </section>
              <section className="form-section">
                <h3>What the engine can promise</h3>
                <p className="muted">
                  It checks availability, eligibility, daily capacity, distinct
                  coverage, configured shift overlap and fatigue using available
                  prior-month history. Generation uses a deterministic greedy
                  strategy; an unresolved requirement is not proof that no
                  solution exists.
                </p>
              </section>
              <section className="form-section">
                <h3>Known boundaries</h3>
                <p className="muted">
                  This is not labor-law certification or an optimal scheduling
                  proof. Only configured shift intervals and recorded
                  adjacent-period history can be checked. Sample holidays and
                  people are fictional.
                </p>
              </section>
              <button className="button" onClick={controller.backup}>
                <FileJson size={16} />
                Download workspace backup
              </button>
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
