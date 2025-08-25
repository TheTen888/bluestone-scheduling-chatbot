from ics import Calendar, Event
from datetime import datetime, timedelta
import pytz

def export_provider_schedule_to_ics(provider_id, provider_schedule, output_filename, 
                                    timezone_str="US/Central", day_start = 9, day_end = 17):
    """
    provider_id: e.g., "provider_0"
    provider_schedule: schedule["provider_0"]
    output_filename: e.g., "provider_0_schedule.ics"
    timezone_str: IANA timezone string like "US/Eastern"
    day_start: Start of the workday in hours (default 9 for 9am)
    day_end: End of the workday in hours (default 17 for 5pm
    """
    cal = Calendar()
    tz = pytz.timezone(timezone_str)

    for date_str, facilities in provider_schedule.items():
        # Parse the date
        naive_date = datetime.strptime(date_str, "%Y-%m-%d")

        # Localize 9am–5pm time range
        start_dt = tz.localize(naive_date.replace(hour=9, minute=0))
        end_dt = tz.localize(naive_date.replace(hour=17, minute=0))

        # Format title and description
        facility_names = [f.replace("_", " ").title() for f in facilities.keys()]
        title = " and ".join(facility_names)

        description_lines = [
            f"{f.replace('_', ' ').title()}: {patients} patients"
            for f, patients in facilities.items()
        ]
        description = "\n".join(description_lines)

        # Create event
        event = Event()
        event.name = title
        event.begin = start_dt
        event.end = end_dt
        event.description = description

        cal.events.add(event)

    # Write the calendar to a file
    with open(output_filename, "w") as f:
        f.writelines(cal)

## Sample usage
# schedule = {
#     "provider_0": {
#         "2025-07-15": {
#             "facility_0": 5,
#             "facility_2": 3
#         },
#         "2025-07-16": {
#             "facility_1": 4
#         }
#     },
#     "provider_1": {
#         "2025-07-15": {
#             "facility_1": 6
#         },
#         "2025-07-17": {
#             "facility_0": 2,
#             "facility_2": 1
#         }
#     }
# }
# export_provider_schedule_to_ics(prov, schedule[prov], "%s_schedule.ics" % prov)