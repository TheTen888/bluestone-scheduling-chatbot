import React, { useState } from 'react';
import { OptimizedDailySchedule } from '../types';
import { DownloadIcon, ListIcon, MonthIcon } from './icons';
import CalendarView from './CalendarView';

interface ScheduleDisplayProps {
    schedule: OptimizedDailySchedule[] | null;
    isLoading: boolean;
    onDownload: (schedule: OptimizedDailySchedule[]) => void;
}

const ListView: React.FC<{ schedule: OptimizedDailySchedule[] }> = ({ schedule }) => (
    <div className="space-y-4">
        {schedule.map(day => (
            <div key={day.date} className={`rounded-lg shadow-sm border p-4 ${day.isOff ? 'bg-slate-50' : 'bg-white'}`}>
                <div className="flex justify-between items-center mb-3">
                    <div>
                        <p className="font-bold text-slate-800">{day.dayOfWeek}</p>
                        <p className="text-sm text-slate-500">{day.date}</p>
                    </div>
                    {!day.isOff && (
                        <div className="flex space-x-4 text-sm text-right">
                            <div>
                                <p className="font-semibold text-indigo-600">{day.totalPatients}</p>
                                <p className="text-slate-500">Patients</p>
                            </div>
                            <div>
                                <p className="font-semibold text-indigo-600">{day.totalTravelTime.toFixed(2)} hrs</p>
                                <p className="text-slate-500">Travel</p>
                            </div>
                        </div>
                    )}
                </div>
                {day.isOff ? (
                    <div className="flex items-center justify-center p-4 bg-slate-100 rounded-md">
                        <span className="font-bold text-slate-600">{day.reason}</span>
                    </div>
                ) : (
                    <div className="text-sm space-y-2">
                        {day.visits.length > 0 ? (
                            day.visits.map(visit => (
                                <div key={visit.facilityId} className="grid grid-cols-3 gap-2 p-2 bg-slate-50 rounded">
                                    <span className="col-span-2 font-medium text-slate-700">{visit.facilityName}</span>
                                    <span className="text-slate-600 text-right">{visit.patients} patients</span>
                                </div>
                            ))
                        ) : (
                            <div className="flex items-center justify-center p-4 bg-slate-50 rounded-md">
                                <span className="text-slate-500">No patients scheduled.</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        ))}
    </div>
);


const ScheduleDisplay: React.FC<ScheduleDisplayProps> = ({ schedule, isLoading, onDownload }) => {
    const [viewMode, setViewMode] = useState<'list' | 'month'>('list');

    const handleExport = () => {
        if (!schedule) return;
        onDownload(schedule);
    };

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex items-center justify-center h-96">
                    <div className="flex items-center space-x-2 text-slate-500">
                        <svg className="animate-spin h-8 w-8 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="text-lg font-medium">Generating optimized schedule...</span>
                    </div>
                </div>
            );
        }

        if (!schedule) {
            return (
                <div className="flex items-center justify-center h-96 bg-slate-50 rounded-lg">
                    <p className="text-slate-500">
                        Generate a schedule to view your optimized calendar here.
                    </p>
                </div>
            );
        }

        return viewMode === 'list'
            ? <ListView schedule={schedule} />
            : <CalendarView schedule={schedule} />;
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800">Optimized Schedule</h2>
                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-slate-200 rounded-lg p-1">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`px-3 py-1 text-sm rounded-md flex items-center gap-2 ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600'}`}
                            aria-label="List view"
                        >
                            <ListIcon /> List
                        </button>
                        <button
                            onClick={() => setViewMode('month')}
                            className={`px-3 py-1 text-sm rounded-md flex items-center gap-2 ${viewMode === 'month' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600'}`}
                            aria-label="Month view"
                        >
                            <MonthIcon /> Month
                        </button>
                    </div>
                    <button
                        onClick={handleExport}
                        disabled={!schedule || isLoading}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-100 rounded-md hover:bg-indigo-200 disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
                        aria-label="Download Calendar (ICS)"
                        title="Download Calendar (ICS)"
                    >
                        <DownloadIcon />
                    </button>
                </div>
            </div>
            {renderContent()}
        </div>
    );
};

export default ScheduleDisplay;