/**
 * DATASTRAW Realistic Seed Dataset
 * 
 * 30 Employees across 3 Pods (with Pod Leads)
 * 20 Brands: 16 Single-Resource (80%), 4 Multi-Resource (20%)
 * 4 Floating Relief Staff with cross-brand eligibility
 * 3 Operating Calendars with process variations
 * Realistic Leaves (Single-primary gap, Multi-resource leave, Public holidays)
 */

import type { ShiftInterval } from '@/core/engine/types';

export interface SeedDataset {
  pods: Array<{ id: string; name: string; leadEmployeeId: string }>;
  employees: Array<{
    id: string;
    name: string;
    email: string;
    podId: string;
    maxDailyCapacity: number;
    preferredOffDay: number; // 0 = Sun
  }>;
  processes: Array<{ id: string; code: string; name: string }>;
  calendars: Array<{
    id: string;
    name: string;
    baseRule: 'EVERY_DAY' | 'DAILY_EXCEPT_HOLIDAYS' | 'MON_SAT_EXCLUDE_HOLIDAYS' | 'WEEKDAYS_ONLY';
    excludePublicHolidays: boolean;
  }>;
  publicHolidays: Array<{ id: string; holidayDate: string; name: string }>;
  brands: Array<{
    id: string;
    name: string;
    podId: string;
    staffingModel: 'SINGLE' | 'MULTI';
  }>;
  brandProcesses: Array<{
    id: string;
    brandId: string;
    processId: string;
    coveredProcessIds?: string[]; // Explicit compatible duties covered by one allocation
    calendarId: string;
    minStaffing: number;
    capacityWeight: number;
    shift?: ShiftInterval; // Shared by every duty in this compatible-process bundle
    calendarOverrides?: Array<{ date: string; action: 'ADD' | 'REMOVE' }>;
    staffingOverrides?: Array<{ date: string; minStaffing: number }>;
  }>;
  assignments: Array<{
    id: string;
    employeeId: string;
    brandProcessId: string;
    role: 'PRIMARY' | 'BACKUP' | 'RELIEF';
    priorityTier: number;
  }>;
  leaves: Array<{
    id: string;
    employeeId: string;
    leaveDate: string;
    leaveType: 'PLANNED' | 'SICK' | 'COMP_OFF';
    status: 'APPROVED';
  }>;
}

export function generateSeedData(): SeedDataset {
  // 1. Pods
  const pods = [
    { id: 'pod-1', name: 'Pod Alpha (Enterprise D2C)', leadEmployeeId: 'emp-01' },
    { id: 'pod-2', name: 'Pod Beta (Lifestyle & Fashion)', leadEmployeeId: 'emp-11' },
    { id: 'pod-3', name: 'Pod Gamma (Electronics & Specialty)', leadEmployeeId: 'emp-21' },
  ];

  // 2. Employees (30 total: 10 per pod)
  // emp-01 to emp-16: 16 single-resource brand primaries
  // emp-17 to emp-26: 10 multi-resource brand primaries
  // emp-27 to emp-30: 4 floating relief employees
  // Staggered preferred weekly-off days (0=Sun, 1=Mon, ..., 6=Sat) reflecting real operations
  const employees = [
    // Pod 1
    { id: 'emp-01', name: 'Aarav Sharma (Pod Lead)', email: 'aarav@datastraw.io', podId: 'pod-1', maxDailyCapacity: 1.0, preferredOffDay: 0 }, // Sun
    { id: 'emp-02', name: 'Ananya Iyer', email: 'ananya@datastraw.io', podId: 'pod-1', maxDailyCapacity: 1.0, preferredOffDay: 1 }, // Mon
    { id: 'emp-03', name: 'Aditya Verma', email: 'aditya@datastraw.io', podId: 'pod-1', maxDailyCapacity: 1.0, preferredOffDay: 2 }, // Tue
    { id: 'emp-04', name: 'Diya Sen', email: 'diya@datastraw.io', podId: 'pod-1', maxDailyCapacity: 1.0, preferredOffDay: 3 }, // Wed
    { id: 'emp-05', name: 'Ishaan Gupta', email: 'ishaan@datastraw.io', podId: 'pod-1', maxDailyCapacity: 1.0, preferredOffDay: 4 }, // Thu
    { id: 'emp-06', name: 'Kavya Nair', email: 'kavya@datastraw.io', podId: 'pod-1', maxDailyCapacity: 1.0, preferredOffDay: 5 }, // Fri
    { id: 'emp-07', name: 'Manish Rao', email: 'manish@datastraw.io', podId: 'pod-1', maxDailyCapacity: 1.0, preferredOffDay: 6 }, // Sat
    { id: 'emp-08', name: 'Neha Joshi', email: 'neha@datastraw.io', podId: 'pod-1', maxDailyCapacity: 1.0, preferredOffDay: 0 }, // Sun
    { id: 'emp-09', name: 'Pranav Kulkarni', email: 'pranav@datastraw.io', podId: 'pod-1', maxDailyCapacity: 1.0, preferredOffDay: 1 }, // Mon
    { id: 'emp-10', name: 'Riya Choudhury', email: 'riya@datastraw.io', podId: 'pod-1', maxDailyCapacity: 1.0, preferredOffDay: 2 }, // Tue

    // Pod 2
    { id: 'emp-11', name: 'Priya Patel (Pod Lead)', email: 'priya@datastraw.io', podId: 'pod-2', maxDailyCapacity: 1.0, preferredOffDay: 0 }, // Sun
    { id: 'emp-12', name: 'Rahul Deshmukh', email: 'rahul@datastraw.io', podId: 'pod-2', maxDailyCapacity: 1.0, preferredOffDay: 3 }, // Wed
    { id: 'emp-13', name: 'Sanya Mirza', email: 'sanya@datastraw.io', podId: 'pod-2', maxDailyCapacity: 1.0, preferredOffDay: 4 }, // Thu
    { id: 'emp-14', name: 'Siddharth Roy', email: 'siddharth@datastraw.io', podId: 'pod-2', maxDailyCapacity: 1.0, preferredOffDay: 5 }, // Fri
    { id: 'emp-15', name: 'Sneha Reddy', email: 'sneha@datastraw.io', podId: 'pod-2', maxDailyCapacity: 1.0, preferredOffDay: 6 }, // Sat
    { id: 'emp-16', name: 'Tanvi Saxena', email: 'tanvi@datastraw.io', podId: 'pod-2', maxDailyCapacity: 1.0, preferredOffDay: 0 }, // Sun
    { id: 'emp-17', name: 'Varun Bhatia', email: 'varun@datastraw.io', podId: 'pod-2', maxDailyCapacity: 1.0, preferredOffDay: 1 }, // Mon
    { id: 'emp-18', name: 'Zoya Khan', email: 'zoya@datastraw.io', podId: 'pod-2', maxDailyCapacity: 1.0, preferredOffDay: 2 }, // Tue
    { id: 'emp-19', name: 'Arjun Das', email: 'arjun@datastraw.io', podId: 'pod-2', maxDailyCapacity: 1.0, preferredOffDay: 3 }, // Wed
    { id: 'emp-20', name: 'Bhavna Menon', email: 'bhavna@datastraw.io', podId: 'pod-2', maxDailyCapacity: 1.0, preferredOffDay: 4 }, // Thu

    // Pod 3
    { id: 'emp-21', name: 'Rohan Mehta (Pod Lead)', email: 'rohan@datastraw.io', podId: 'pod-3', maxDailyCapacity: 1.0, preferredOffDay: 0 }, // Sun
    { id: 'emp-22', name: 'Chirag Sethi', email: 'chirag@datastraw.io', podId: 'pod-3', maxDailyCapacity: 1.0, preferredOffDay: 5 }, // Fri
    { id: 'emp-23', name: 'Divya Aggarwal', email: 'divya@datastraw.io', podId: 'pod-3', maxDailyCapacity: 1.0, preferredOffDay: 6 }, // Sat
    { id: 'emp-24', name: 'Gaurav Pillai', email: 'gaurav@datastraw.io', podId: 'pod-3', maxDailyCapacity: 1.0, preferredOffDay: 1 }, // Mon
    { id: 'emp-25', name: 'Harsh Vardhan', email: 'harsh@datastraw.io', podId: 'pod-3', maxDailyCapacity: 1.0, preferredOffDay: 2 }, // Tue
    { id: 'emp-26', name: 'Kritika Bansal', email: 'kritika@datastraw.io', podId: 'pod-3', maxDailyCapacity: 1.0, preferredOffDay: 3 }, // Wed

    // 4 Floating Relief Staff
    { id: 'emp-27', name: 'Lakshya Singhania (Relief)', email: 'lakshya@datastraw.io', podId: 'pod-1', maxDailyCapacity: 1.0, preferredOffDay: 1 }, // Mon
    { id: 'emp-28', name: 'Meera Nambiar (Relief)', email: 'meera@datastraw.io', podId: 'pod-2', maxDailyCapacity: 1.0, preferredOffDay: 2 },    // Tue
    { id: 'emp-29', name: 'Nikhil Trivedi (Relief)', email: 'nikhil@datastraw.io', podId: 'pod-3', maxDailyCapacity: 1.0, preferredOffDay: 3 },   // Wed
    { id: 'emp-30', name: 'Pooja Hegde (Relief)', email: 'pooja@datastraw.io', podId: 'pod-1', maxDailyCapacity: 1.0, preferredOffDay: 4 },      // Thu
  ];

  // 3. Operational Processes
  const processes = [
    { id: 'proc-cs', code: 'CS', name: 'Customer Support' },
    { id: 'proc-acc', code: 'ACC', name: 'Abandoned Cart Conversions' },
    { id: 'proc-ndr', code: 'NDR', name: 'Non-Delivery Report Management' },
    { id: 'proc-ret', code: 'RET', name: 'Customer Retention & Loyalty' },
  ];

  // 4. Operating Calendars
  const calendars = [
    { id: 'cal-365', name: '365 Days Continuous', baseRule: 'EVERY_DAY' as const, excludePublicHolidays: false },
    { id: 'cal-daily-no-holidays', name: 'Daily Except Holidays', baseRule: 'DAILY_EXCEPT_HOLIDAYS' as const, excludePublicHolidays: true },
    { id: 'cal-mon-sat', name: 'Mon-Sat Business', baseRule: 'MON_SAT_EXCLUDE_HOLIDAYS' as const, excludePublicHolidays: true },
  ];

  // 5. Public Holidays in November 2026
  const publicHolidays = [
    { id: 'hol-1', holidayDate: '2026-11-12', name: 'Diwali Festival of Lights' },
    { id: 'hol-2', holidayDate: '2026-11-25', name: 'Guru Nanak Jayanti' },
  ];

  // 6. 20 Brands (16 Single-Resource, 4 Multi-Resource)
  const brands = [
    // Pod 1 Single-Resource Brands (6)
    { id: 'brand-01', name: 'Apex Athletics', podId: 'pod-1', staffingModel: 'SINGLE' as const },
    { id: 'brand-02', name: 'Bloom Botanicals', podId: 'pod-1', staffingModel: 'SINGLE' as const },
    { id: 'brand-03', name: 'Comet Footwear', podId: 'pod-1', staffingModel: 'SINGLE' as const },
    { id: 'brand-04', name: 'Daily Greens', podId: 'pod-1', staffingModel: 'SINGLE' as const },
    { id: 'brand-05', name: 'Echo Audio', podId: 'pod-1', staffingModel: 'SINGLE' as const },
    { id: 'brand-06', name: 'Frost Skincare', podId: 'pod-1', staffingModel: 'SINGLE' as const },

    // Pod 2 Single-Resource Brands (5)
    { id: 'brand-07', name: 'Glow Nutrition', podId: 'pod-2', staffingModel: 'SINGLE' as const },
    { id: 'brand-08', name: 'Haven Home', podId: 'pod-2', staffingModel: 'SINGLE' as const },
    { id: 'brand-09', name: 'Indigo Apparel', podId: 'pod-2', staffingModel: 'SINGLE' as const },
    { id: 'brand-10', name: 'Joule Energy', podId: 'pod-2', staffingModel: 'SINGLE' as const },
    { id: 'brand-11', name: 'Krave Snacks', podId: 'pod-2', staffingModel: 'SINGLE' as const },

    // Pod 3 Single-Resource Brands (5)
    { id: 'brand-12', name: 'Loom Textiles', podId: 'pod-3', staffingModel: 'SINGLE' as const },
    { id: 'brand-13', name: 'Mist Fragrances', podId: 'pod-3', staffingModel: 'SINGLE' as const },
    { id: 'brand-14', name: 'Nest Babycare', podId: 'pod-3', staffingModel: 'SINGLE' as const },
    { id: 'brand-15', name: 'Orbit Eyewear', podId: 'pod-3', staffingModel: 'SINGLE' as const },
    { id: 'brand-16', name: 'Pulse Wearables', podId: 'pod-3', staffingModel: 'SINGLE' as const },

    // Multi-Resource Brands (4)
    { id: 'brand-17', name: 'MegaStore India', podId: 'pod-1', staffingModel: 'MULTI' as const },
    { id: 'brand-18', name: 'Nova Electronics', podId: 'pod-2', staffingModel: 'MULTI' as const },
    { id: 'brand-19', name: 'Silk & Saffron', podId: 'pod-2', staffingModel: 'MULTI' as const },
    { id: 'brand-20', name: 'Urban Tribe', podId: 'pod-3', staffingModel: 'MULTI' as const },
  ];

  // 7. Brand Processes & Operating Calendars
  const brandProcesses: SeedDataset['brandProcesses'] = [];
  const assignments: SeedDataset['assignments'] = [];

  // Single-Resource Brands 1 to 16: bundled brand process
  // Assign calendars: mix of 365d, daily no holidays, and mon-sat
  const calendarDistribution = [
    'cal-365', 'cal-daily-no-holidays', 'cal-mon-sat', 'cal-365',
    'cal-daily-no-holidays', 'cal-mon-sat', 'cal-365', 'cal-daily-no-holidays',
    'cal-mon-sat', 'cal-365', 'cal-daily-no-holidays', 'cal-mon-sat',
    'cal-365', 'cal-daily-no-holidays', 'cal-mon-sat', 'cal-365',
  ];

  for (let i = 0; i < 16; i++) {
    const brand = brands[i];
    const bpId = `bp-${brand.id}-bundle`;
    const calId = calendarDistribution[i];

    brandProcesses.push({
      id: bpId,
      brandId: brand.id,
      processId: 'proc-cs', // primary anchor process
      coveredProcessIds: ['proc-cs', 'proc-acc', 'proc-ndr', 'proc-ret'],
      calendarId: calId,
      minStaffing: 1,
      capacityWeight: 1.0,
    });

    // Primary assignment (emp-01 to emp-16)
    assignments.push({
      id: `asgn-${brand.id}-primary`,
      employeeId: employees[i].id,
      brandProcessId: bpId,
      role: 'PRIMARY',
      priorityTier: 1,
    });

    // All 4 floating relief staff (emp-27 to emp-30) have cross-trained backup eligibility
    for (let r = 26; r <= 29; r++) {
      assignments.push({
        id: `asgn-${brand.id}-relief-${employees[r].id}`,
        employeeId: employees[r].id,
        brandProcessId: bpId,
        role: 'RELIEF',
        priorityTier: 3,
      });
    }
  }

  // Multi-Resource Brands:
  // Brand 17: MegaStore India (CS: minStaffing = 2 on cal-365, ACC: minStaffing = 1 on cal-daily)
  brandProcesses.push(
    {
      id: 'bp-brand-17-cs',
      brandId: 'brand-17',
      processId: 'proc-cs',
      calendarId: 'cal-365',
      minStaffing: 2, // Requires 2 distinct employees
      capacityWeight: 1.0,
    },
    {
      id: 'bp-brand-17-acc',
      brandId: 'brand-17',
      processId: 'proc-acc',
      calendarId: 'cal-daily-no-holidays',
      minStaffing: 1,
      capacityWeight: 1.0,
    }
  );
  // Primaries for Brand 17: emp-17, emp-18 for CS; emp-19 for ACC
  assignments.push(
    { id: 'asgn-b17-cs-1', employeeId: 'emp-17', brandProcessId: 'bp-brand-17-cs', role: 'PRIMARY', priorityTier: 1 },
    { id: 'asgn-b17-cs-2', employeeId: 'emp-18', brandProcessId: 'bp-brand-17-cs', role: 'PRIMARY', priorityTier: 1 },
    { id: 'asgn-b17-acc-1', employeeId: 'emp-19', brandProcessId: 'bp-brand-17-acc', role: 'PRIMARY', priorityTier: 1 },
    // Backups
    { id: 'asgn-b17-cs-relief-1', employeeId: 'emp-27', brandProcessId: 'bp-brand-17-cs', role: 'RELIEF', priorityTier: 3 },
    { id: 'asgn-b17-cs-relief-2', employeeId: 'emp-29', brandProcessId: 'bp-brand-17-cs', role: 'RELIEF', priorityTier: 3 },
    { id: 'asgn-b17-acc-relief', employeeId: 'emp-28', brandProcessId: 'bp-brand-17-acc', role: 'RELIEF', priorityTier: 3 }
  );

  // Brand 18: Nova Electronics (CS: 1 on cal-365, NDR: 1 on cal-mon-sat)
  brandProcesses.push(
    { id: 'bp-brand-18-cs', brandId: 'brand-18', processId: 'proc-cs', calendarId: 'cal-365', minStaffing: 1, capacityWeight: 1.0 },
    { id: 'bp-brand-18-ndr', brandId: 'brand-18', processId: 'proc-ndr', calendarId: 'cal-mon-sat', minStaffing: 1, capacityWeight: 1.0 }
  );
  assignments.push(
    { id: 'asgn-b18-cs-1', employeeId: 'emp-20', brandProcessId: 'bp-brand-18-cs', role: 'PRIMARY', priorityTier: 1 },
    { id: 'asgn-b18-cs-relief', employeeId: 'emp-28', brandProcessId: 'bp-brand-18-cs', role: 'RELIEF', priorityTier: 3 },
    { id: 'asgn-b18-ndr-1', employeeId: 'emp-21', brandProcessId: 'bp-brand-18-ndr', role: 'PRIMARY', priorityTier: 1 },
    { id: 'asgn-b18-ndr-relief', employeeId: 'emp-30', brandProcessId: 'bp-brand-18-ndr', role: 'RELIEF', priorityTier: 3 }
  );

  // Brand 19: Silk & Saffron (CS: 1 on cal-daily, ACC: 1 on cal-daily)
  brandProcesses.push(
    { id: 'bp-brand-19-cs', brandId: 'brand-19', processId: 'proc-cs', calendarId: 'cal-daily-no-holidays', minStaffing: 1, capacityWeight: 1.0 },
    { id: 'bp-brand-19-acc', brandId: 'brand-19', processId: 'proc-acc', calendarId: 'cal-daily-no-holidays', minStaffing: 1, capacityWeight: 1.0 }
  );
  assignments.push(
    { id: 'asgn-b19-cs-1', employeeId: 'emp-22', brandProcessId: 'bp-brand-19-cs', role: 'PRIMARY', priorityTier: 1 },
    { id: 'asgn-b19-cs-relief', employeeId: 'emp-29', brandProcessId: 'bp-brand-19-cs', role: 'RELIEF', priorityTier: 3 },
    { id: 'asgn-b19-acc-1', employeeId: 'emp-23', brandProcessId: 'bp-brand-19-acc', role: 'PRIMARY', priorityTier: 1 },
    { id: 'asgn-b19-acc-relief', employeeId: 'emp-27', brandProcessId: 'bp-brand-19-acc', role: 'RELIEF', priorityTier: 3 }
  );

  // Brand 20: Urban Tribe (CS: 1 on cal-365, RET: 1 on cal-mon-sat)
  brandProcesses.push(
    { id: 'bp-brand-20-cs', brandId: 'brand-20', processId: 'proc-cs', calendarId: 'cal-365', minStaffing: 1, capacityWeight: 1.0 },
    { id: 'bp-brand-20-ret', brandId: 'brand-20', processId: 'proc-ret', calendarId: 'cal-mon-sat', minStaffing: 1, capacityWeight: 1.0 }
  );
  assignments.push(
    { id: 'asgn-b20-cs-1', employeeId: 'emp-24', brandProcessId: 'bp-brand-20-cs', role: 'PRIMARY', priorityTier: 1 },
    { id: 'asgn-b20-cs-relief', employeeId: 'emp-30', brandProcessId: 'bp-brand-20-cs', role: 'RELIEF', priorityTier: 3 },
    { id: 'asgn-b20-ret-1', employeeId: 'emp-25', brandProcessId: 'bp-brand-20-ret', role: 'PRIMARY', priorityTier: 1 },
    { id: 'asgn-b20-ret-relief', employeeId: 'emp-28', brandProcessId: 'bp-brand-20-ret', role: 'RELIEF', priorityTier: 3 }
  );

  // 8. Pre-staged Demo Leaves:
  // - Comet Footwear sole primary (emp-03) is on Sick Leave on Nov 10, 11, 12
  // - MegaStore CS primary (emp-17) is on Planned Leave on Nov 15
  const leaves: SeedDataset['leaves'] = [
    { id: 'leave-1', employeeId: 'emp-03', leaveDate: '2026-11-10', leaveType: 'SICK', status: 'APPROVED' },
    { id: 'leave-2', employeeId: 'emp-03', leaveDate: '2026-11-11', leaveType: 'SICK', status: 'APPROVED' },
    { id: 'leave-3', employeeId: 'emp-03', leaveDate: '2026-11-12', leaveType: 'SICK', status: 'APPROVED' },
    { id: 'leave-4', employeeId: 'emp-17', leaveDate: '2026-11-15', leaveType: 'PLANNED', status: 'APPROVED' },
  ];

  return {
    pods,
    employees,
    processes,
    calendars,
    publicHolidays,
    brands,
    brandProcesses,
    assignments,
    leaves,
  };
}
