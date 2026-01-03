// User and Authentication Types
export interface UserProfile {
    id: string | null;
    name: string | null;
    email?: string;
    role: 'provider' | 'administrator' | null;
    picture?: string;
}

// Schedule Constraint Types
export enum DayOfWeek {
    Sunday = 'Sunday',
    Monday = 'Monday',
    Tuesday = 'Tuesday',
    Wednesday = 'Wednesday',
    Thursday = 'Thursday',
    Friday = 'Friday',
    Saturday = 'Saturday',
}

export interface PTORequest {
    startDate: string;
    endDate: string;
}

export interface WeeklyAvailability {
    day: DayOfWeek;
    isWorking: boolean;
    startTime?: string;
    endTime?: string;
}

export interface DayOfWeekConstraint {
    facilityId: string;
    day: DayOfWeek;
}

export interface DateConstraint {
    facilityId: string;
    date: string;
}

export interface ProviderConstraints {
    ptoRequests: PTORequest[];
    weeklyAvailability: WeeklyAvailability[];
    dailyPatientLimit: number;
    dayOfWeekConstraints: DayOfWeekConstraint[];
    dateConstraints: DateConstraint[];
}

// Chat and Conversation Types
export type ConversationState =
    | 'GREETING'
    | 'AWAITING_NAME'
    | 'AWAITING_ID'
    | 'CONFIRMING_IDENTITY'
    | 'SCHEDULING'
    | 'AWAITING_SCHEDULE_CONFIRMATION';

export interface ChatMessage {
    id: string;
    sender: 'user' | 'system';
    text: string;
}

// Schedule and Optimization Types

// export interface OptimizedDailySchedule {
//     date: string;
//     visits: PatientVisit[];
//     totalPatients: number;
//     totalTravelTime: number;
// }


export interface OptimizationResult {
    schedule: OptimizedDailySchedule[];
    metrics: OptimizationMetrics;
}


export interface PatientVisit {
    facilityId: string;
    facilityName: string;
    patients: number;
}

export interface OptimizedDailySchedule {
    date: string;
    dayOfWeek: DayOfWeek;
    isOff: boolean;
    reason?: string;
    visits: PatientVisit[];
    totalPatients: number;
    totalTravelTime: number;
}

export interface OptimizationMetrics {
    totalDemand: number;
    totalScheduled: number;
    remainingToSchedule: number;
    isGoalMet: boolean;
    coverageRate: number;
    totalTravelTime: number;
    workingDays: number;
    avgPatientsPerDay: number;
    avgTravelPerDay: number;
    facilitiesVisited: number;
}

export interface OptimizationResult {
    schedule: OptimizedDailySchedule[];
    metrics: OptimizationMetrics;
}

// Backend API Response Types
export interface BackendOptimizationResult {
    success: boolean;
    error?: string;
    results: {
        selected_provider: string;
        schedule?: {
            [providerId: string]: {
                [date: string]: {
                    [facilityId: string]: number;
                };
            };
        };
        daily_travel_times?: {
            [providerId: string]: {
                [date: string]: number;
            };
        };
        total_patients_served: number;
        total_patient_demand: number;
        summary_stats?: {
            total_travel_time: number;
            days_worked: number;
            avg_patients_per_day: number;
            avg_travel_per_day: number;
            facilities_visited: number;
        };
    };
}

// Gemini Service Types
export interface ScheduleChanges {
    selectedStartDate?: string;
    horizon?: 'month' | 'quarter';
    startMonth?: string;
    censusMonth?: string;
    ptoRequests?: PTORequest[];
    weeklyAvailability?: WeeklyAvailability[];
    dailyPatientLimit?: number;
    dayOfWeekConstraints?: DayOfWeekConstraint[];
    dateConstraints?: DateConstraint[];
    unclearRequest?: string;
    ptoRemovals?: string[];
    dateConstraintRemovals?: string[];
    dayOfWeekConstraintRemovals?: string[];
}

export interface ParsedResponse {
    updatedConstraints: ProviderConstraints;
    systemResponse: string;
    parsedData?: {
        scheduleChanges?: ScheduleChanges;
        role?: 'provider' | 'administrator';
        name?: string;
        id?: string;
        confirmation?: boolean;
    };
}

export interface AdvancedSettings {
    lambda_param: number;      // Workload Balancing (0.0 - 10.0)
    lambda_facility: number;   // Visit Frequency/Gap Penalty (0.0 - 10.0)
    lambda_bunching: number;   // Avoid Bunching Penalty (0.0 - 10.0)
    alpha: number;             // Service Buffer (0.0 - 0.5)
    facility_visit_window: number;
}
