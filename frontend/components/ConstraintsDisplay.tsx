import React from 'react';
import { ProviderConstraints, DayOfWeek, DateConstraint, DayOfWeekConstraint } from '../types';

interface ConstraintsDisplayProps {
    constraints: ProviderConstraints;
}

const Card: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-slate-700 border-b pb-2 mb-4">{title}</h3>
        {children}
    </div>
);

const ConstraintsDisplay: React.FC<ConstraintsDisplayProps> = ({ constraints }) => {
    const dayOrder = Object.values(DayOfWeek);

    return (
        <div className="space-y-6 p-4">
            <h2 className="text-2xl font-bold text-slate-800">Current Constraints</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card title="Weekly Availability">
                    <div className="space-y-2">
                        {(constraints.weeklyAvailability || []).sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day)).map(({
                                                                                                                                           day,
                                                                                                                                           isWorking,
                                                                                                                                           startTime,
                                                                                                                                           endTime
                                                                                                                                       }) => (
                            <div key={day}
                                 className="flex justify-between items-center text-sm p-2 rounded-md even:bg-slate-50">
                                <span className="font-medium text-slate-600">{day}</span>
                                {isWorking ? (
                                    <span className="text-green-600 font-semibold">{startTime} - {endTime}</span>
                                ) : (
                                    <span className="text-red-500 font-semibold">Off</span>
                                )}
                            </div>
                        ))}
                    </div>
                </Card>

                <Card title="Daily Patient Limit">
                    <div className="flex items-center justify-center h-full">
                        <p className="text-4xl font-bold text-indigo-600">
                            {constraints.dailyPatientLimit ?? 'Not Set'}
                        </p>
                    </div>
                </Card>

                <div className="md:col-span-2">
                    <Card title="Required Facility Visits">
                        {(!constraints.dateConstraints || constraints.dateConstraints.length === 0) &&
                        (!constraints.dayOfWeekConstraints || constraints.dayOfWeekConstraints.length === 0) ? (
                            <p className="text-sm text-slate-500 text-center py-4">No specific facility visits have been
                                requested.</p>
                        ) : (
                            <div className="space-y-4">
                                {/* Display Specific Date Constraints */}
                                {constraints.dateConstraints && constraints.dateConstraints.length > 0 && (
                                    <ul className="space-y-2">
                                        {[...constraints.dateConstraints].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((req, index) => (
                                            <li key={`date-${index}`}
                                                className="text-sm bg-slate-50 p-2 rounded-md flex justify-between">
                                                <span className="font-medium text-slate-800">On {req.date}:</span>
                                                <span className="font-semibold text-indigo-600">{req.facilityId}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {/* Display Day of Week Constraints */}
                                {constraints.dayOfWeekConstraints && constraints.dayOfWeekConstraints.length > 0 && (
                                    <ul className="space-y-2">
                                        {[...constraints.dayOfWeekConstraints].sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day)).map((req, index) => (
                                            <li key={`dow-${index}`}
                                                className="text-sm bg-slate-50 p-2 rounded-md flex justify-between">
                                                <span className="font-medium text-slate-800">Every {req.day}:</span>
                                                <span className="font-semibold text-indigo-600">{req.facilityId}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </Card>
                </div>

                <div className="md:col-span-2">
                    <Card title="Paid Time Off (PTO)">
                        {constraints.ptoRequests && constraints.ptoRequests.length > 0 ? (
                            <ul className="space-y-2">
                                {[...constraints.ptoRequests].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()).map((pto, index) => (
                                    <li key={index} className="text-sm bg-slate-50 p-2 rounded-md">
                                    <span className="font-medium text-slate-800">
                                        {pto.startDate === pto.endDate ? pto.startDate : `${pto.startDate} to ${pto.endDate}`}
                                    </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-slate-500 text-center py-4">No PTO requests have been added.</p>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default ConstraintsDisplay;