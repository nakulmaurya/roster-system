import { z } from 'zod';
import { isISODate } from '@/core/engine/integrity';

const id = z.string().min(1).max(200);
const name = z.string().trim().min(1).max(200);
export const isoDateSchema = z.string().refine(isISODate, 'Use a real YYYY-MM-DD date');
export const periodSchema = z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) });
export const timezoneSchema = z.string().min(1).refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}, 'Use a recognized IANA timezone');
export const shiftSchema = z.object({
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(0).max(1440),
  timezone: timezoneSchema,
});
export const trailingContextSchema = z.object({
  resourceTrailingWorkDays: z.record(z.string(), z.array(isoDateSchema)),
  resourceWorkIntervals: z.record(z.string(), z.array(z.object({
    date: isoDateSchema, startMs: z.number().finite(), endMs: z.number().finite(),
  }).refine(x => x.endMs > x.startMs && x.endMs - x.startMs <= 26 * 3600000, 'Invalid historical interval'))).optional(),
});
export const solverConfigSchema = z.object({
  maxConsecutiveDays: z.number().int().min(1).max(14),
  minimumRestMinutes: z.number().int().min(0).max(10080).optional(),
  enforcePodAffinity: z.boolean(), honorPreferredOffDay: z.boolean(), preferPrimaryContinuity: z.boolean(),
});
export const allocationSchema = z.object({
  id, slotId: id, serviceId: id, resourceId: id, date: isoDateSchema,
  capacityConsumed: z.number().positive(), isLocked: z.boolean(),
  source: z.enum(['SYSTEM_SOLVER', 'MANUAL_EDIT', 'REPAIR_SUGGESTION']),
});
export const employeeSchema = z.object({
  id, name, email: z.string().max(254), podId: id, maxDailyCapacity: z.number().positive(),
  preferredOffDay: z.number().int().min(0).max(6),
});
export const datasetSchema = z.object({
  pods: z.array(z.object({ id, name, leadEmployeeId: id })).max(500),
  employees: z.array(employeeSchema).max(2000),
  processes: z.array(z.object({ id, code: name, name })).max(500),
  calendars: z.array(z.object({ id, name, baseRule: z.enum(['EVERY_DAY', 'DAILY_EXCEPT_HOLIDAYS', 'MON_SAT_EXCLUDE_HOLIDAYS', 'WEEKDAYS_ONLY']), excludePublicHolidays: z.boolean() })).max(500),
  publicHolidays: z.array(z.object({ id, name, holidayDate: isoDateSchema })).max(5000),
  brands: z.array(z.object({ id, name, podId: id, staffingModel: z.enum(['SINGLE', 'MULTI']) })).max(2000),
  brandProcesses: z.array(z.object({
    id, brandId: id, processId: id, coveredProcessIds: z.array(id).min(1).optional(), calendarId: id, minStaffing: z.number().int().min(0).max(2000),
    capacityWeight: z.number().positive(), shift: shiftSchema.optional(),
    calendarOverrides: z.array(z.object({ date: isoDateSchema, action: z.enum(['ADD', 'REMOVE']) })).optional(),
    staffingOverrides: z.array(z.object({ date: isoDateSchema, minStaffing: z.number().int().min(0).max(2000) })).optional(),
  })).max(5000),
  assignments: z.array(z.object({ id, employeeId: id, brandProcessId: id, role: z.enum(['PRIMARY', 'BACKUP', 'RELIEF']), priorityTier: z.number().int().min(1).max(3) })).max(100000),
  leaves: z.array(z.object({ id, employeeId: id, leaveDate: isoDateSchema, leaveType: z.enum(['PLANNED', 'SICK', 'COMP_OFF']), status: z.literal('APPROVED') })).max(50000),
}).superRefine((data, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  for (const [key, entries] of Object.entries(data)) {
    const ids = new Set<string>();
    for (const entry of entries) {
      if (ids.has(entry.id)) fail(`Duplicate ${key} ID: ${entry.id}`);
      ids.add(entry.id);
    }
  }
  const pods = new Set(data.pods.map(x => x.id));
  const employees = new Set(data.employees.map(x => x.id));
  const brands = new Set(data.brands.map(x => x.id));
  const processes = new Set(data.processes.map(x => x.id));
  const calendars = new Set(data.calendars.map(x => x.id));
  const services = new Set(data.brandProcesses.map(x => x.id));
  for (const x of data.pods) if (!employees.has(x.leadEmployeeId)) fail(`Unknown pod lead: ${x.leadEmployeeId}`);
  for (const x of [...data.employees, ...data.brands]) if (!pods.has(x.podId)) fail(`Unknown pod: ${x.podId}`);
  for (const x of data.brandProcesses) if (!brands.has(x.brandId) || !processes.has(x.processId) || !calendars.has(x.calendarId)) fail(`Broken brand/process/calendar reference: ${x.id}`);
  for (const x of data.brandProcesses) {
    if (x.coveredProcessIds && (!x.coveredProcessIds.includes(x.processId) || x.coveredProcessIds.some(p => !processes.has(p)) || new Set(x.coveredProcessIds).size !== x.coveredProcessIds.length)) fail(`Invalid work bundle: ${x.id}`);
  }
  const owners = new Set<string>();
  for (const service of data.brandProcesses) for (const processId of service.coveredProcessIds ?? [service.processId]) {
    const key = JSON.stringify([service.brandId, processId]);
    if (owners.has(key)) fail(`Process ${processId} has overlapping requirements for brand ${service.brandId}. Split or move the duty explicitly.`);
    owners.add(key);
  }
  const pairs = new Set<string>();
  for (const x of data.assignments) {
    if (!employees.has(x.employeeId) || !services.has(x.brandProcessId)) fail(`Broken assignment: ${x.id}`);
    const pair = JSON.stringify([x.employeeId, x.brandProcessId]);
    if (pairs.has(pair)) fail(`Duplicate eligibility: ${x.id}`);
    pairs.add(pair);
  }
  for (const x of data.leaves) if (!employees.has(x.employeeId)) fail(`Unknown leave employee: ${x.id}`);
});

export const publishedSnapshotSchema = z.object({
  version: z.number().int().positive(), publishedAt: z.string().datetime({ offset: true }), period: periodSchema,
  dataset: datasetSchema, solverConfig: solverConfigSchema, allocations: z.array(allocationSchema).max(100000),
  trailingContext: trailingContextSchema.optional(),
});
export const workspaceDocumentSchema = z.object({
  period: periodSchema, status: z.enum(['DRAFT', 'PUBLISHED']), version: z.number().int().positive(),
  dataset: datasetSchema, solverConfig: solverConfigSchema,
  allocations: z.array(allocationSchema).max(100000), baselineAllocations: z.array(allocationSchema).max(100000),
  publishedAt: z.string().optional(), lastGeneratedAt: z.string().optional(),
  publications: z.array(publishedSnapshotSchema).max(10000),
}).superRefine((document, ctx) => {
  let previousVersion = 0;
  for (const snapshot of document.publications) {
    if (snapshot.version <= previousVersion) ctx.addIssue({ code: 'custom', message: 'Publication versions must be unique and strictly increasing.' });
    if (snapshot.period.year !== document.period.year || snapshot.period.month !== document.period.month) ctx.addIssue({ code: 'custom', message: 'Publication history must belong to its workspace month.' });
    previousVersion = snapshot.version;
  }
});
export const librarySchema = z.object({
  format: z.literal('datastraw-workspaces'), schemaVersion: z.literal(1),
  workspaces: z.record(z.string(), workspaceDocumentSchema),
});
