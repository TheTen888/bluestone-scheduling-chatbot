// File: src/services/icalService.tsx
import { OptimizedDailySchedule } from '../types';

// Helper to format date and time into basic iCalendar format (YYYYMMDDTHHMMSS)
const formatIcalDate = (date: string, time: string): string => {
    // Input format: date 'YYYY-MM-DD', time 'HH:MM'
    const [year, month, day] = date.split('-');
    const [hour, minute] = time.split(':');
    return `${year}${month}${day}T${hour}${minute}00`;
};

// Helper to format date for all-day events
const formatDateOnly = (date: string): string => {
    // Input format: 'YYYY-MM-DD', output: 'YYYYMMDD'
    return date.replace(/-/g, '');
};

// Generates the ICS file content from the optimized schedule
export const generateIcsFile = (schedule: OptimizedDailySchedule[], userName: string): string => {
    if (!schedule || schedule.length === 0) {
        return '';
    }

    const now = new Date();
    const dtStamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const uidDomain = 'schedulemanager.com';

    let icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//ProviderScheduleManager//NONSGML v1.0//EN',
        `X-WR-CALNAME:Schedule for ${userName}`,
        'CALSCALE:GREGORIAN',
    ].join('\r\n');

    schedule.forEach(daySchedule => {
        // Handle days off (PTO or regular day off)
        if (daySchedule.isOff) {
            icsContent += [
                '\r\nBEGIN:VEVENT',
                `UID:${daySchedule.date}-OFF-${userName.replace(/\s/g, '')}@${uidDomain}`,
                `DTSTAMP:${dtStamp}`,
                `DTSTART;VALUE=DATE:${formatDateOnly(daySchedule.date)}`,
                `DTEND;VALUE=DATE:${formatDateOnly(daySchedule.date)}`,
                `SUMMARY:${daySchedule.reason || 'Day Off'}`,
                `DESCRIPTION:${daySchedule.reason || 'Day Off'}`,
                'END:VEVENT',
            ].join('\r\n');
        }
        // Handle working days with visits
        else if (daySchedule.visits && daySchedule.visits.length > 0) {
            daySchedule.visits.forEach((visit, index) => {
                // Default work hours if not specified (9 AM to 5 PM)
                const startTime = '09:00';
                const endTime = '17:00';

                icsContent += [
                    '\r\nBEGIN:VEVENT',
                    `UID:${daySchedule.date}-VISIT-${index}-${userName.replace(/\s/g, '')}@${uidDomain}`,
                    `DTSTAMP:${dtStamp}`,
                    `DTSTART:${formatIcalDate(daySchedule.date, startTime)}`,
                    `DTEND:${formatIcalDate(daySchedule.date, endTime)}`,
                    `SUMMARY:Patient Visit at ${visit.facilityName}`,
                    `LOCATION:${visit.facilityName}`,
                    `DESCRIPTION:${visit.patients} patient(s) scheduled at ${visit.facilityName}`,
                    'END:VEVENT',
                ].join('\r\n');
            });
        }
    });

    icsContent += '\r\nEND:VCALENDAR';
    return icsContent;
};