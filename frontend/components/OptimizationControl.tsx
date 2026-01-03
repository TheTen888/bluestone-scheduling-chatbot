
import React, { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { CalendarIcon } from './icons';

// Helper: format a Date as local YYYY-MM-DD without UTC shifting
const formatLocalDateISO = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Helper: parse a YYYY-MM-DD string into a local Date (no UTC shift)
const parseLocalDate = (iso: string): Date => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
};


interface OptimizationControlProps {
    onGenerate: () => void;
    isOptimizing: boolean;
    isSchedulingMode: boolean;
    businessLines: string[];
    selectedBusinessLine: string;
    onBusinessLineChange: (line: string) => void;

    // NEW: start date (Monday) for 4-week rolling schedule
    selectedStartDate: string | null;
    onStartDateChange: (dateIso: string) => void;
    planningDuration: number;
    onPlanningDurationChange: (weeks: number) => void;

    // Already passed from App.tsx (later usage after discussed with qc)
    horizon: 'month' | 'quarter';
    onHorizonChange: (h: 'month' | 'quarter') => void;
}


const OptimizationControl: React.FC<OptimizationControlProps> = ({ 
    onGenerate, 
    isOptimizing, 
    isSchedulingMode,
    businessLines,
    selectedBusinessLine,
    onBusinessLineChange,
    selectedStartDate,
    onStartDateChange,
    horizon,
    onHorizonChange,
    planningDuration,
    onPlanningDurationChange,
}) => {
    // Local state to control the calendar popover visibility
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);

    // Convert string ISO date to Date object for the calendar (local, no UTC shift)
    const selectedDateObj = selectedStartDate ? parseLocalDate(selectedStartDate) : undefined;


    const handleDaySelect = (date: Date | undefined) => {
        if (!date) return;
        // Only allow Mondays as a safety check (0 = Sun, 1 = Mon, ..., 6 = Sat)
        if (date.getDay() !== 1) return;
    
        // Use local YYYY-MM-DD instead of UTC ISO string
        const iso = formatLocalDateISO(date);
        onStartDateChange(iso);
        setIsCalendarOpen(false);
    };
    

    return (
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold text-slate-800">Generate Schedule</h3>
                    <p className="text-sm text-slate-500">
                        After updating your constraints, select your business line and a start date (Monday), then generate a new optimized schedule.
                    </p>

                </div>
                 <button
                    onClick={onGenerate}
                    disabled={isOptimizing || !isSchedulingMode}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 font-semibold text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all flex-shrink-0"
                >
                    {isOptimizing ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Optimizing...
                        </>
                    ) : (
                        <>
                            <CalendarIcon />
                            Generate Optimized Schedule
                        </>
                    )}
                </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t">
                <div>
                    <label htmlFor="businessLine" className="block text-sm font-medium text-slate-700">Business
                        Line</label>
                    <select
                        id="businessLine"
                        name="businessLine"
                        value={selectedBusinessLine}
                        onChange={(e) => onBusinessLineChange(e.target.value)}
                        disabled={!isSchedulingMode}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md disabled:bg-slate-200"
                    >
                        {businessLines.map(line => <option key={line} value={line}>{line}</option>)}
                    </select>
                </div>

                <div className="relative">
                    <label htmlFor="startDate" className="block text-sm font-medium text-slate-700">
                        Start Date (Monday)
                    </label>

                    {/* Clickable field that opens the calendar */}
                    <button
                        id="startDate"
                        type="button"
                        disabled={!isSchedulingMode}
                        onClick={() => setIsCalendarOpen((open) => !open)}
                        className="mt-1 w-full flex items-center justify-between px-3 py-2 border border-slate-300 rounded-md bg-white text-left text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-200"
                    >
                            <span>
                                {selectedStartDate
                                    ? parseLocalDate(selectedStartDate).toLocaleDateString(undefined, {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                    })
                                    : 'Select a Monday as start date'}
                            </span>
                        <CalendarIcon/>
                    </button>


                    {/* Popup calendar */}
                    {isCalendarOpen && (
                        <div className="absolute z-10 mt-2 bg-white border border-slate-200 rounded-lg shadow-lg p-3">
                            <DayPicker
                                mode="single"
                                selected={selectedDateObj}
                                onSelect={handleDaySelect}
                                // Disable all days except Mondays (1)
                                disabled={{dayOfWeek: [0, 2, 3, 4, 5, 6]}}
                                // Highlight all Mondays
                                modifiers={{
                                    monday: {dayOfWeek: [1]},
                                }}
                                modifiersClassNames={{
                                    monday: 'rdp-monday',
                                }}
                            />

                        </div>
                    )}
                </div>
                <div>
                    <label htmlFor="planningDuration" className="block text-sm font-medium text-slate-700">
                        Planning Duration
                    </label>
                    <div className="mt-1 flex rounded-md shadow-sm">
                        <button
                            type="button"
                            onClick={() => onPlanningDurationChange(4)}
                            disabled={!isSchedulingMode}
                            className={`relative inline-flex items-center px-4 py-2 rounded-l-md border text-sm font-medium focus:z-10 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 ${
                                planningDuration === 4
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                            }`}
                        >
                            4 Weeks
                        </button>
                        <button
                            type="button"
                            onClick={() => onPlanningDurationChange(5)}
                            disabled={!isSchedulingMode}
                            className={`relative -ml-px inline-flex items-center px-4 py-2 rounded-r-md border text-sm font-medium focus:z-10 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 ${
                                planningDuration === 5
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                            }`}
                        >
                            5 Weeks
                        </button>
                    </div>
                </div>
            </div>
            </div>
            );
            };

            export default OptimizationControl;
