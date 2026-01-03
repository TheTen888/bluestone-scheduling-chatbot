import { ProviderConstraints, OptimizationResult, BackendOptimizationResult, OptimizedDailySchedule, DayOfWeek, PTORequest } from '../types';

const API_BASE_URL = 'http://localhost:5001/api';

// --- API Fetch Functions ---

export const fetchBusinessLines = async (): Promise<string[]> => {
    const response = await fetch(`${API_BASE_URL}/business_lines`);
    if (!response.ok) throw new Error("Failed to fetch business lines");
    return response.json();
};

export const fetchCensusMonths = async (): Promise<string[]> => {
    const response = await fetch(`${API_BASE_URL}/census_months`);
    if (!response.ok) throw new Error("Failed to fetch census months");
    return response.json();
};

export const runOptimization = async (payload: any, constraints: ProviderConstraints): Promise<OptimizationResult> => {
    const response = await fetch(`${API_BASE_URL}/run_optimization`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    const data: BackendOptimizationResult = await response.json();

    if (!response.ok || !data.success) {
        throw new Error(data.error || `API Error: ${response.status}`);
    }

    // --- NEW: pass horizon + start_month so we can render quarter correctly ---
    return transformBackendResponse(
        data,
        {
            censusMonth: payload.census_month,
            horizon: payload.horizon ?? 'month',
            startMonth: payload.start_month ?? payload.census_month,
            startMonday: payload.start_monday ?? undefined,
            weeks: payload.weeks ?? 4,
        },
        constraints
    );
};

// --- Helpers for calendar range ---

const getDaysInMonth = (year: number, monthZeroBased: number): Date[] => {
    const date = new Date(year, monthZeroBased, 1);
    const dates: Date[] = [];
    while (date.getMonth() === monthZeroBased) {
        dates.push(new Date(date));
        date.setDate(date.getDate() + 1);
    }
    return dates;
};

// --- NEW: build dates for a quarter starting from startMonth (YYYY-MM) ---
const getDaysInQuarter = (startMonth: string): Date[] => {
    const [y, m] = startMonth.split('-').map(Number);
    const m0 = m - 1; // zero-based
    return [
        ...getDaysInMonth(y, m0),
        ...getDaysInMonth(y, (m0 + 1) % 12 + (m0 + 1 >= 12 ? 0 : 0)), // safe; handled below anyway
        ...getDaysInMonth(m0 + 2 >= 12 ? y + 1 : y, (m0 + 2) % 12),
    ];
};

// --- NEW: build a rolling window (e.g., 4 weeks) starting from a specific date (YYYY-MM-DD) ---
const getDaysInRollingWindow = (startDateStr: string, weeks: number = 4): Date[] => {
    const [y, m, d] = startDateStr.split('-').map(Number);
    const start = new Date(y, m - 1, d);
    const days: Date[] = [];
    
    for (let i = 0; i < weeks * 7; i++) {
        const dt = new Date(start);
        dt.setDate(start.getDate() + i);
        days.push(dt);
    }
    return days;
};


const isDateInPTO = (date: Date, ptoRequests: PTORequest[]): boolean => {
    const checkTime = date.getTime();
    for (const pto of ptoRequests) {
        const startTime = new Date(pto.startDate + 'T00:00:00').getTime();
        const endTime = new Date(pto.endDate + 'T23:59:59').getTime();
        if (checkTime >= startTime && checkTime <= endTime) {
            return true;
        }
    }
    return false;
};

// --- Response Transformation Logic ---

type TransformOpts = {
    censusMonth: string;         // original single month
    horizon: 'month' | 'quarter';
    startMonth: string;          // first month of the quarter (YYYY-MM)
    startMonday?: string;
    weeks?: number;
};

const transformBackendResponse = (
    backendResult: BackendOptimizationResult,
    opts: TransformOpts,
    constraints: ProviderConstraints
): OptimizationResult => {
    const { results } = backendResult;

    // NOTE: backend returns real IDs; schedule is keyed by selected_provider
    const providerId = results.selected_provider;

    // Defensive checks for possibly missing fields
    const providerSchedule = results.schedule ? (results.schedule[providerId] || {}) : {};
    const providerTravel = results.daily_travel_times ? (results.daily_travel_times[providerId] || {}) : {};

    // --- Choose calendar range based on startMonday / horizon ---
    const dayNames: DayOfWeek[] = [
        DayOfWeek.Sunday,
        DayOfWeek.Monday,
        DayOfWeek.Tuesday,
        DayOfWeek.Wednesday,
        DayOfWeek.Thursday,
        DayOfWeek.Friday,
        DayOfWeek.Saturday
    ];
    let calendarDays: Date[] = [];

    if (opts.startMonday) {
        // Rolling window: Use the 'weeks' passed in options (default to 4 if missing)
        calendarDays = getDaysInRollingWindow(opts.startMonday, opts.weeks || 4);
    } else if (opts.horizon === 'quarter') {
        // Legacy quarter mode
        calendarDays = getDaysInQuarter(opts.startMonth);
    }


    const finalSchedule: OptimizedDailySchedule[] = calendarDays.map(date => {
        const dateStr = date.toISOString().split('T')[0];
        const dayOfWeek = dayNames[date.getDay()];
        const dayData = providerSchedule[dateStr];

        if (dayData) { // Working day with visits
            const visits = Object.entries(dayData).map(([facilityId, patients]) => ({
                facilityId,
                facilityName: facilityId, // fallback: IDs as names
                patients: patients as number,
            }));
            const totalPatients = visits.reduce((sum, v) => sum + v.patients, 0);

            return {
                date: dateStr,
                dayOfWeek,
                isOff: false,
                visits,
                totalPatients,
                totalTravelTime: providerTravel[dateStr] || 0,
            };
        } else {
            const isPto = isDateInPTO(date, constraints.ptoRequests);
            const availability = constraints.weeklyAvailability.find(d => d.day === dayOfWeek);
            const isDayOff = !availability?.isWorking;

            if (isPto || isDayOff) {
                return {
                    date: dateStr,
                    dayOfWeek,
                    isOff: true,
                    reason: isPto ? 'PTO' : 'Day Off',
                    visits: [],
                    totalPatients: 0,
                    totalTravelTime: 0,
                };
            } else {
                return {
                    date: dateStr,
                    dayOfWeek,
                    isOff: false,
                    visits: [],
                    totalPatients: 0,
                    totalTravelTime: 0,
                };
            }
        }
    });

    const totalScheduled = results.total_patients_served;
    const totalDemand = results.total_patient_demand;

    const metrics: OptimizationResult['metrics'] = {
        totalDemand: totalDemand,
        totalScheduled: totalScheduled,
        isGoalMet: totalScheduled >= totalDemand,
        remainingToSchedule: Math.max(0, totalDemand - totalScheduled),
        coverageRate: totalDemand > 0 ? (totalScheduled / totalDemand) * 100 : 100,
        totalTravelTime: results.summary_stats?.total_travel_time || 0,
        workingDays: results.summary_stats?.days_worked || 0,
        avgPatientsPerDay: results.summary_stats?.avg_patients_per_day || 0,
        avgTravelPerDay: results.summary_stats?.avg_travel_per_day || 0,
        facilitiesVisited: results.summary_stats?.facilities_visited || 0,
    };

    return {
        schedule: finalSchedule,
        metrics,
    };
};