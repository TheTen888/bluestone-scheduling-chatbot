import React from 'react';
import { OptimizationMetrics } from '../types';
import { PatientIcon, TargetIcon, ClockIcon, CalendarIcon } from './icons';

// A simple building icon for facilities
const FacilityIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m-1 4h1m5-4h1m-1 4h1m-1-8h1m-5 8h1m-1-4h1m-1-4h1" />
    </svg>
);

interface DashboardProps {
    metrics: OptimizationMetrics | null;
}

const StatCard: React.FC<{ title: string; value: string; icon: React.ReactNode; color: string }> = ({ title, value, icon, color }) => (
    <div className="bg-white p-4 rounded-lg shadow-sm border flex items-center">
        <div className={`p-3 rounded-full mr-4 ${color}`}>
            {icon}
        </div>
        <div>
            <p className="text-sm text-slate-500">{title}</p>
            <p className="text-2xl font-bold text-slate-800">{value}</p>
        </div>
    </div>
);

const Dashboard: React.FC<DashboardProps> = ({ metrics }) => {
    if (!metrics) {
        return (
            <div>
                <h2 className="text-2xl font-bold text-slate-800 mb-4">Monthly Performance</h2>
                <div className="text-center py-8 bg-slate-50 rounded-lg">
                    <p className="text-slate-500">Generate a schedule to see your performance metrics.</p>
                </div>
            </div>
        );
    }

    // Safely access metrics with default values
    const coverageRate = metrics.coverageRate ?? 0;
    const totalScheduled = metrics.totalScheduled ?? 0;
    const totalDemand = metrics.totalDemand ?? 0;
    const workingDays = metrics.workingDays ?? 0;
    const facilitiesVisited = metrics.facilitiesVisited ?? 0;
    const totalTravelTime = metrics.totalTravelTime ?? 0;
    const avgPatientsPerDay = metrics.avgPatientsPerDay ?? 0;
    const avgTravelPerDay = metrics.avgTravelPerDay ?? 0;

    return (
        <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-4">Monthly Performance</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    title="Coverage Rate"
                    value={`${coverageRate.toFixed(1)}%`}
                    icon={<TargetIcon className="w-6 h-6 text-white" />}
                    color="bg-green-500"
                />
                <StatCard
                    title="Patients Scheduled"
                    value={`${totalScheduled} / ${totalDemand}`}
                    icon={<PatientIcon className="w-6 h-6 text-white" />}
                    color="bg-indigo-500"
                />
                <StatCard
                    title="Days Worked"
                    value={`${workingDays}`}
                    icon={<CalendarIcon className="w-6 h-6 text-white" />}
                    color="bg-amber-500"
                />
                <StatCard
                    title="Facilities Visited"
                    value={`${facilitiesVisited}`}
                    icon={<FacilityIcon className="w-6 h-6 text-white" />}
                    color="bg-cyan-500"
                />
                <StatCard
                    title="Total Travel"
                    value={`${totalTravelTime.toFixed(1)} hrs`}
                    icon={<ClockIcon className="w-6 h-6 text-white" />}
                    color="bg-sky-500"
                />
                <StatCard
                    title="Avg Patients / Day"
                    value={`${avgPatientsPerDay.toFixed(1)}`}
                    icon={<PatientIcon className="w-6 h-6 text-white" />}
                    color="bg-violet-500"
                />
                <StatCard
                    title="Avg Travel / Day"
                    value={`${avgTravelPerDay.toFixed(1)} hrs`}
                    icon={<ClockIcon className="w-6 h-6 text-white" />}
                    color="bg-rose-500"
                />
            </div>
        </div>
    );
};

export default Dashboard;