import React, { useState, useEffect } from 'react';
import { OptimizedDailySchedule } from '../types';

interface CalendarViewProps {
  schedule: OptimizedDailySchedule[];
}

const CalendarView: React.FC<CalendarViewProps> = ({ schedule }) => {
  const [displayDate, setDisplayDate] = useState(new Date());

  useEffect(() => {
    // Set the initial display date based on the schedule when it loads
    if (schedule && schedule.length > 0) {
      // Use the middle of the month to avoid timezone issues with `new Date()`
      setDisplayDate(new Date(schedule[0].date + 'T12:00:00'));
    }
  }, [schedule]); // Re-run only if the schedule data itself changes.

  if (!schedule || schedule.length === 0) {
    return <p>No schedule data available.</p>;
  }

  const month = displayDate.getMonth();
  const year = displayDate.getFullYear();

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const handlePrevMonth = () => {
    setDisplayDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setDisplayDate(new Date(year, month + 1, 1));
  };
  
  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDisplayDate(new Date(year, parseInt(e.target.value), 1));
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDisplayDate(new Date(parseInt(e.target.value), month, 1));
  };

  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => <div key={`blank-${i}`} className="border-r border-b"></div>);

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const dayNumber = i + 1;
    const date = new Date(year, month, dayNumber);
    // Adjust for timezone offset to get YYYY-MM-DD in local time
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    const dateString = date.toISOString().split('T')[0];
    const dayData = schedule.find(d => d.date === dateString);

    let content;
    if (dayData) {
      if (dayData.isOff) {
        content = (
          <div className="h-full bg-slate-100 flex items-center justify-center">
            <span className="font-bold text-slate-500 text-xs">{dayData.reason}</span>
          </div>
        );
      } else if (dayData.totalPatients > 0) {
        // content = (
        //   <div className="p-1 text-xs text-left">
        //     <div className="font-bold text-indigo-700 bg-indigo-100 rounded-full w-6 h-6 flex items-center justify-center mb-1">{dayData.totalPatients}</div>
        //     {<p className="text-slate-600">{dayData.totalTravelTime.toFixed(1)}hr travel</p>}
        //   </div>
        // );
        content = (
          <div className="p-1 text-xs text-left overflow-y-auto h-full">
            <div className="font-bold text-indigo-700 bg-indigo-100 rounded-full w-6 h-6 flex items-center justify-center mb-1 flex-shrink-0">{dayData.totalPatients}</div>
            <div className="mt-1">
              {dayData.visits.map(visit => (
                <p key={visit.facilityId} className="text-slate-700 truncate" title={visit.facilityName}>
                  {visit.facilityName}
                </p>
              ))}
            </div>
          </div>
        );
      } else {
        content = (
            <div className="h-full bg-green-50 flex items-center justify-center">
              <span className="text-green-600 text-xs font-semibold">Available</span>
            </div>
        )
      }
    } else {
         content = <div className="p-1"></div>;
    }
    
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    const isToday = today.toISOString().split('T')[0] === dateString;

    return (
      <div key={dayNumber} className="border-r border-b min-h-[100px] relative">
        <span className={`absolute top-1 right-2 text-xs font-semibold ${isToday ? 'bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center' : 'text-slate-600'}`}>{dayNumber}</span>
        <div className="pt-6 h-full">{content}</div>
      </div>
    );
  });
  
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({length: 11}, (_, i) => currentYear - 5 + i);

  // Small chevron icon for buttons
  const ChevronLeftIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
  const ChevronRightIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );

  return (
    <div className="bg-white rounded-lg border shadow-sm">
       <div className="flex justify-between items-center p-4 border-b">
        <h2 className="text-xl font-bold text-slate-800">
            {months[month]} {year}
        </h2>
        <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2">
                <select value={month} onChange={handleMonthChange} className="border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 rounded-md shadow-sm p-1 text-sm font-semibold">
                    {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
                <select value={year} onChange={handleYearChange} className="border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 rounded-md shadow-sm p-1 text-sm font-semibold">
                    {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>
            <div className="flex items-center bg-slate-100 rounded-md">
                <button onClick={handlePrevMonth} className="p-2 rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors" aria-label="Previous month">
                <ChevronLeftIcon />
                </button>
                <button onClick={handleNextMonth} className="p-2 rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors" aria-label="Next month">
                <ChevronRightIcon />
                </button>
            </div>
        </div>
    </div>

      <div className="grid grid-cols-7 border-b">
        {dayNames.map(day => (
          <div key={day} className="text-center font-semibold text-sm text-slate-600 p-2 border-r last:border-r-0">{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {blanks}
        {days}
      </div>
    </div>
  );
};

export default CalendarView;