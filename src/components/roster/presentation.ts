import type { RosterWorkspaceState } from "@/domain/roster/service";
import type { SeedDataset } from "@/domain/roster/seed-data";
import { generateDateSequence } from "@/core/engine";

export type RosterView = "BRAND" | "EMPLOYEE" | "POD" | "PROCESS";
export type CalendarDensity = "week" | "month";
export type ServiceRecord = SeedDataset["brandProcesses"][number];
export const cleanName = (name: string) =>
  name.replace(/\s*\((?:Pod Lead|Relief)\)\s*/g, "").trim();
export function initials(name: string) {
  return cleanName(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}
export function shortName(name: string) {
  const parts = cleanName(name).split(/\s+/);
  return parts.length < 2 ? parts[0] : `${parts[0]} ${parts.at(-1)?.[0]}.`;
}
export function avatarTone(id: string) {
  return ["sand", "blue", "green", "lilac"][
    Array.from(id).reduce((total, char) => total + char.charCodeAt(0), 0) % 4
  ];
}
export function dateLabel(
  date: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) {
  return new Intl.DateTimeFormat("en-GB", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
export function periodValue(workspace: RosterWorkspaceState) {
  return `${workspace.period.year}-${String(workspace.period.month).padStart(2, "0")}`;
}
export function allDates(workspace: RosterWorkspaceState) {
  return generateDateSequence(
    workspace.problem.horizon.startDate,
    workspace.problem.horizon.endDate,
  );
}
export function processLabel(
  workspace: RosterWorkspaceState,
  service: ServiceRecord,
) {
  return (service.coveredProcessIds ?? [service.processId])
    .map(
      (id) => workspace.dataset.processes.find((p) => p.id === id)?.code ?? id,
    )
    .join(", ");
}
export function serviceLabel(
  workspace: RosterWorkspaceState,
  serviceId: string,
) {
  const service = workspace.dataset.brandProcesses.find(
    (s) => s.id === serviceId,
  );
  if (!service) return serviceId;
  const brand = workspace.dataset.brands.find((b) => b.id === service.brandId);
  return `${brand?.name ?? service.brandId} · ${processLabel(workspace, service)}`;
}
