# !/usr/bin/env python3
"""
Healthcare Provider Scheduling Backend API (Unified Version)

This Flask application provides endpoints for both the advanced config panel UI
and the interactive chatbot UI.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import sys
import os
import pandas as pd
from pathlib import Path
import json
from datetime import datetime, timedelta
import calendar
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from icalendar import Calendar, Event  # ⬅️ NEW: For ICS calendar file generation

# ⬇️⬇️ NEW: Load environment variables ⬇️⬇️
from dotenv import load_dotenv
load_dotenv()  # This loads variables from .env file
# ⬆️⬆️ -------------------------------- ⬆️⬆️

# Add the models directory to Python path for imports
current_dir = Path(__file__).parent
models_dir = current_dir / 'models'
sys.path.append(str(models_dir))

from models.config import load_config
from models.dataloader import (
    load_pcp_facility_data,
    load_distance_matrices,
    load_provider_unavailable_dates,
    convert_single_provider_results_to_real_ids,
    get_working_days_for_month
)
from models.ortools_travel_optimized_model import create_and_solve_optimization_model
from utils.quick_optimize_ortools import extract_patient_data_for_provider
from utils.business_line_optimize_ortools import extract_patient_data_for_business_line, combine_provider_results

app = Flask(__name__)
CORS(app)  # Enable CORS for all domains on all routes


# <<< --- NEW HELPER FUNCTION FOR CHATBOT --- >>>
def process_dynamic_constraints(constraints_payload, provider_idx):
    """
    Converts the provider_constraints object from the chatbot into the
    set of unavailable dates required by the optimization model.
    """
    unavailable_dates = set()
    if not constraints_payload:
        return unavailable_dates

    # Process PTO requests from the chatbot
    for pto in constraints_payload.get("ptoRequests", []):
        try:
            start_date = datetime.strptime(pto['startDate'], '%Y-%m-%d').date()
            end_date = datetime.strptime(pto['endDate'], '%Y-%m-%d').date()
            delta = end_date - start_date
            for i in range(delta.days + 1):
                day = start_date + timedelta(days=i)
                unavailable_dates.add((provider_idx, day.strftime('%Y-%m-%d')))
        except (ValueError, KeyError) as e:
            print(f"Warning: Could not parse PTO request {pto}. Error: {e}")


    return unavailable_dates


# <<< --- END OF NEW HELPER FUNCTION --- >>>


# ⬇️⬇️⬇️ NEW: ICS CALENDAR FILE GENERATOR ⬇️⬇️⬇️
def generate_ics_from_schedule(schedule_data, provider_name, output_filename="schedule.ics"):
    """
    Generate an ICS calendar file from optimization schedule results.
    
    Args:
        schedule_data: Dictionary with 'schedule' key containing date -> day info
        provider_name: Name of the provider
        output_filename: Name of the ICS file to create
    
    Returns:
        str: Path to the generated ICS file
    """
    cal = Calendar()
    cal.add('prodid', '-//Provider Schedule Manager//EN')
    cal.add('version', '2.0')
    cal.add('calscale', 'GREGORIAN')
    cal.add('method', 'PUBLISH')
    cal.add('x-wr-calname', f'{provider_name} - Work Schedule')
    cal.add('x-wr-timezone', 'America/Chicago')
    
    # Process each day in the schedule
    schedule = schedule_data.get('schedule', {})
    
    for date_str, day_info in schedule.items():
        try:
            # Parse the date
            event_date = datetime.strptime(date_str, '%Y-%m-%d')
            
            # Get facility visits for this day
            facilities = day_info.get('facilities', [])
            patient_count = day_info.get('patients', 0)
            
            if facilities or patient_count > 0:
                # Create calendar event
                event = Event()
                
                # Create summary based on facilities visited
                if facilities:
                    if len(facilities) == 1:
                        summary = f"{patient_count} patients at {facilities[0]}"
                    else:
                        summary = f"{patient_count} patients at {len(facilities)} facilities"
                else:
                    summary = f"{patient_count} patients"
                
                event.add('summary', summary)
                event.add('dtstart', event_date.date())
                event.add('dtend', (event_date + timedelta(days=1)).date())
                
                # Add description with more details
                description_parts = [
                    f"Provider: {provider_name}",
                    f"Total Patients: {patient_count}",
                ]
                
                if facilities:
                    description_parts.append(f"Facilities: {', '.join(facilities)}")
                
                if 'travel_time' in day_info:
                    description_parts.append(f"Travel Time: {day_info['travel_time']} minutes")
                
                event.add('description', '\n'.join(description_parts))
                event.add('status', 'CONFIRMED')
                event.add('location', ', '.join(facilities) if facilities else '')
                
                cal.add_component(event)
        
        except (ValueError, KeyError) as e:
            print(f"Warning: Could not process date {date_str}: {e}")
            continue
    
    # Write to file
    with open(output_filename, 'wb') as f:
        f.write(cal.to_ical())
    
    print(f"✅ Generated ICS calendar file: {output_filename}")
    return output_filename
# ⬆️⬆️⬆️ END OF ICS GENERATOR ⬆️⬆️⬆️


@app.route("/api/business_lines", methods=["GET"])
def get_business_lines():
    """Endpoint to fetch the list of available business lines."""
    try:
        # Load base config to get the list of business lines
        config = load_config()
        return jsonify(config.get("BUSINESS_LINES", []))
    except Exception as e:
        return jsonify({"error": str(e)}), 500



@app.route('/api/run_optimization', methods=['POST'])
def run_optimization_endpoint():
    """
    Run the healthcare provider scheduling optimization.
    Supports both full business line and single provider optimization.
    NOW SUPPORTS dynamic constraints from the chatbot frontend.
    """
    try:
        request_data = request.get_json()
        business_line = request_data.get('business_line') or request_data.get('BUSINESS_LINE', 'Wisconsin Geriatrics')
        start_monday = request_data.get('start_monday')
        optimization_mode = request_data.get('optimization_mode', 'full_business_line')
        selected_provider = request_data.get('selected_provider', None)
        max_patients_per_day = int(request_data.get('max_patients_per_day', 15))
        lambda_param = float(request_data.get('lambda_param', 0))
        lambda_facility = float(request_data.get('lambda_facility', 0.1))
        lambda_bunching = float(request_data.get('lambda_bunching', 0.1))
        alpha = float(request_data.get('alpha', 0.05))
        facility_visit_window = int(request_data.get('facility_visit_window', 10))
        provider_constraints_payload = request_data.get('provider_constraints', None)
        # <<< --- END OF MODIFICATION --- >>>

        current_config = load_config(business_line=business_line)

        print(f"Starting {optimization_mode} optimization for {business_line} ({start_monday})")

        if optimization_mode == 'single_provider' and selected_provider:
            pcp_data = load_pcp_facility_data(
                csv_path="data/anonymized/PCP_Facility.csv",
                business_line=business_line
            )
            provider_index = pcp_data['provider_mappings'][selected_provider]

            patient_data = extract_patient_data_for_provider(pcp_data, start_monday, selected_provider)
            distance_data = load_distance_matrices(business_line)

            # Load static unavailable dates from file
            unavailable_dates_from_file = load_provider_unavailable_dates("data/provider_unavailable_dates.csv",
                                                                          pcp_data)

            # Process dynamic constraints from the chatbot payload
            dynamic_unavailable_dates = process_dynamic_constraints(provider_constraints_payload, provider_index)

            # Combine static and dynamic constraints
            all_unavailable_dates = unavailable_dates_from_file.union(dynamic_unavailable_dates)
            if dynamic_unavailable_dates:
                print(f"Applied {len(dynamic_unavailable_dates)} dynamic constraints from chatbot.")

            valid_pf_pairs = set(pcp_data.get('provider_facility_pairs', []))
            valid_pf_pairs = set((p, f) for p, f in valid_pf_pairs if p == provider_index)

            # Decide which calendar days the model will use (month vs rolling 4-week window)
            if start_monday:
                try:
                    start_date = datetime.strptime(start_monday, '%Y-%m-%d').date()
                except ValueError:
                    return jsonify({'success': False, 'error': f'Invalid start_monday: {start_monday}. Expected YYYY-MM-DD'}), 400

                working_days = []
                current = start_date
                end_date = start_date + timedelta(days=7 * 4)  # 4-week rolling window
                while current < end_date:
                    if current.weekday() < 5:  # Mon–Fri only
                        working_days.append(current)
                    current += timedelta(days=1)



            # <<< --- NEW: PROCESS REQUIRED VISIT CONSTRAINTS --- >>>
            required_visits = set()
            forbidden_visits = set()
            if provider_constraints_payload:
                try:
                    # Get the exact list of working days the model will use (month or rolling window)
                    # working_days is already computed above
                    date_to_day_index = {day.strftime('%Y-%m-%d'): idx for idx, day in enumerate(working_days)}

                    day_of_week_mapping = {"Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4}
                    facility_mappings = pcp_data.get('facility_mappings', {})


                    # Get list of valid facility IDs for helpful error messages
                    reverse_facility_mapping = {idx: fid for fid, idx in facility_mappings.items()}
                    valid_facility_ids = sorted([
                        reverse_facility_mapping.get(f_idx, f"Index_{f_idx}")
                        for (p, f_idx) in valid_pf_pairs
                    ])

                    # Process specific date constraints
                    for constraint in provider_constraints_payload.get('dateConstraints', []):
                        facility_id = constraint.get('facilityId')
                        date_str = constraint.get('date')
                        facility_idx = facility_mappings.get(facility_id)
                        day_idx = date_to_day_index.get(date_str)  # This is the model's 'd' index
                        print("constraint: " + str(constraint))
                        print("facility_idx: " + str(facility_idx))
                        print("valid_pf_pairs: " + str(valid_pf_pairs))

                        # Check if provider-facility pair is valid before adding
                        # Check if facility exists in mappings
                        if facility_idx is None:
                            raise ValueError(
                                f"Facility '{facility_id}' does not exist in the system. "
                                f"Please check the facility ID."
                            )

                        # Check if date is valid
                        if day_idx is None:
                            raise ValueError(
                                f"Date '{date_str}' is not a valid working day. "
                            )

                        # Check if provider-facility pair is valid
                        if (provider_index, facility_idx) not in valid_pf_pairs:
                            raise ValueError(
                                f"You requested a required visit to '{facility_id}' on {date_str}, "
                                f"but that facility is not in your assigned list. "
                                f"Your assigned facilities are: {', '.join(valid_facility_ids[:5])}"
                                f"{' and ' + str(len(valid_facility_ids) - 5) + ' more' if len(valid_facility_ids) > 5 else ''}."
                            )
                        required_visits.add((provider_index, facility_idx, day_idx))

                    # Process day of week constraints
                    for constraint in provider_constraints_payload.get('dayOfWeekConstraints', []):
                        facility_id = constraint.get('facilityId')
                        day_name = constraint.get('day')
                        day_of_week_num = day_of_week_mapping.get(day_name)
                        facility_idx = facility_mappings.get(facility_id)

                        # Check if facility exists in mappings
                        if facility_idx is None:
                            raise ValueError(
                                f"Facility '{facility_id}' does not exist in the system. "
                                f"Please check the facility ID."
                            )

                        # Check if date is valid
                        if day_of_week_num is None:
                            raise ValueError(
                                f"Invalid day name '{day_name}'. "
                                f"Valid days are: Monday, Tuesday, Wednesday, Thursday, Friday."
                            )

                        # Check if provider-facility pair is valid
                        if (provider_index, facility_idx) not in valid_pf_pairs:
                            raise ValueError(
                                f"You requested required visits to '{facility_id}' on {day_name}s, "
                                f"but that facility is not in your assigned list. "
                                f"Your assigned facilities are: {', '.join(valid_facility_ids[:5])}"
                                f"{' and ' + str(len(valid_facility_ids) - 5) + ' more' if len(valid_facility_ids) > 5 else ''}."
                            )

                        for d_idx, date_obj in enumerate(working_days):
                            if date_obj.weekday() != day_of_week_num:
                                forbidden_visits.add((provider_index, facility_idx, d_idx))

                    if required_visits:
                        print(f"Applied {len(required_visits)} dynamic required visit constraints.")
                    if forbidden_visits:
                        print(f"Applied {len(forbidden_visits)} dynamic visit day-of-week restrictions.")

                except ValueError as ve:
                    # Catch ValueError and return as HTTP error
                    print(f"Required visit constraint error: {ve}")
                    return jsonify({'success': False, 'error': str(ve)}), 400
                except Exception as e:
                    print(f"Warning: Could not process required visit constraints. Error: {e}")
                    return jsonify(
                        {'success': False, 'error': f'Error processing required visit constraints: {str(e)}'}), 400

            # <<< --- START: PRE-OPTIMIZATION CHECKS --- >>>
            try:
                # 1. Get parameters from request (default to 4 weeks if not specified)
                requested_weeks = int(request_data.get('weeks', 4))
                alpha_val = float(request_data.get('alpha', 0.05))

                # [New] Extract Weekly Availability and parse non-working weekdays (0=Mon, 4=Fri)
                weekly_availability = provider_constraints_payload.get("weeklyAvailability", [])
                non_working_weekdays = set()
                day_name_map = {"Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5,
                                "Sunday": 6}

                # If weeklyAvailability is provided, check for days marked as isWorking=False
                for entry in weekly_availability:
                    if not entry.get('isWorking', True):
                        d_name = entry.get('day')
                        if d_name in day_name_map:
                            non_working_weekdays.add(day_name_map[d_name])

                # 2. Prepare set of specific unavailable dates (PTO + dates from CSV)
                unavailable_day_strings = {
                    date_str for (p_idx, date_str) in all_unavailable_dates
                    if p_idx == provider_index
                }

                # 3. Calculate "Adjusted" Demand
                # Precisely replicates the model's logic: each facility count is multiplied by (1+alpha) and rounded.
                raw_patient_counts = patient_data.get('patient_counts', [])
                adjusted_patient_requirements = [
                    max(0, round(count * (1 + alpha_val)))
                    for count in raw_patient_counts
                ]
                total_adjusted_demand = sum(adjusted_patient_requirements)

                # 4. Helper function to calculate precise capacity (accounting for both PTO and Weekly Availability)
                def calculate_adjusted_capacity(num_weeks, start_date_obj):
                    available_days_count = 0
                    curr = start_date_obj
                    end = start_date_obj + timedelta(days=7 * num_weeks)

                    while curr < end:
                        # Only consider Mon-Fri (Model typically schedules Mon-Fri)
                        if curr.weekday() < 5:
                            # Check 1: Is it a recurring day off? (e.g., "No Fridays")
                            if curr.weekday() in non_working_weekdays:
                                curr += timedelta(days=1)
                                continue

                            # Check 2: Is it a specific PTO date?
                            d_str = curr.strftime('%Y-%m-%d')
                            if d_str in unavailable_day_strings:
                                curr += timedelta(days=1)
                                continue

                            # Only valid if both checks pass
                            available_days_count += 1

                        curr += timedelta(days=1)

                    return available_days_count, available_days_count * max_patients_per_day

                start_date_obj = datetime.strptime(start_monday, '%Y-%m-%d').date()

                # 5. Execute Capacity Check
                real_days_available, real_capacity = calculate_adjusted_capacity(requested_weeks, start_date_obj)

                # Debug logs
                print(f"Pre-check: Adjusted Demand (w/ alpha {alpha_val}) = {total_adjusted_demand}")
                print(f"Pre-check: Actual Available Days (minus PTO & Weekday settings) = {real_days_available}")
                print(f"Pre-check: Max Capacity = {real_capacity}")

                if total_adjusted_demand > real_capacity:
                    error_msg = (
                        f"Based on your constraints (including PTO and weekly availability), the adjusted patient demand is {total_adjusted_demand} "
                        f"(includes {int(alpha_val * 100)}% buffer), but your max capacity is only {real_capacity} "
                        f"({real_days_available} working days × {max_patients_per_day} patients/day). "
                    )

                    suggestions = []
                    suggestions.append(f"Increase Daily Patient Limit")
                    suggestions.append("Reduce PTO requests")
                    suggestions.append("Update Weekly Availability")

                    # If currently asking for 4 weeks, check if 5 weeks would solve it
                    if requested_weeks == 4:
                        _, capacity_5w = calculate_adjusted_capacity(5, start_date_obj)
                        if total_adjusted_demand <= capacity_5w:
                            suggestions.append("Select '5 Weeks' planning duration")

                    suggestion_str = " or ".join(suggestions)

                    raise ValueError(f"{error_msg} Please {suggestion_str}.")

                # Generate working_days list for the model to use
                working_days = []
                current = start_date_obj
                end_date = start_date_obj + timedelta(days=7 * requested_weeks)
                while current < end_date:
                    if current.weekday() < 5:
                        working_days.append(current)
                    current += timedelta(days=1)

                # Get mappings to show friendly names in error messages
                reverse_facility_mapping = {idx: fid for fid, idx in pcp_data.get('facility_mappings', {}).items()}

                # --- CHECK 2: Direct Conflicts (Required Visit on Day Off) ---
                for (p_idx, f_idx, d_idx) in required_visits:
                    # Find the date string for this required visit
                    date_of_visit = working_days[d_idx].strftime('%Y-%m-%d')
                    if date_of_visit in unavailable_day_strings:
                        facility_id = reverse_facility_mapping.get(f_idx, f"Index {f_idx}")

                        raise ValueError(
                            f"You requested a required visit to {facility_id} on {date_of_visit}, "
                            "but that date is also marked as a day off (either PTO or a non-working day). "
                            "Please remove one of these constraints."
                        )

                print("Pre-optimization checks passed.")


            except ValueError as ve:
                # If a pre-flight check fails, return the user-friendly error
                print(f"Pre-optimization check failed: {ve}")
                return jsonify({'success': False, 'error': str(ve)}), 400

            weekly_availability = provider_constraints_payload.get("weeklyAvailability", [])

            results = create_and_solve_optimization_model(
                providers=len(pcp_data['provider_mappings']),
                facilities=len(pcp_data['facility_mappings']),
                business_line=business_line,
                target_provider=provider_index,
                pcp_facility_data=pcp_data,
                patient_data=patient_data,
                distance_data=distance_data,
                weeks=requested_weeks,
                max_patients_per_day=max_patients_per_day,
                lambda_param=lambda_param,
                lambda_facility=lambda_facility,
                lambda_bunching=lambda_bunching,
                alpha=alpha,
                facility_visit_window=facility_visit_window,
                provider_unavailable_dates=all_unavailable_dates,
                required_visits=required_visits,
                forbidden_visits=forbidden_visits,
                start_monday=start_monday,
                weekly_availability=weekly_availability
            )

            converted_results = convert_single_provider_results_to_real_ids(results, pcp_data, selected_provider)

            # Format and return results...
            # (The rest of this block can remain the same)
            provider_demand = patient_data.get('provider_demand', 0) if patient_data else 0
            facilities_served = len(patient_data.get('provider_facilities', [])) if patient_data else 0

            formatted_results = {
                'optimization_mode': 'single_provider',
                'selected_provider': selected_provider,
                'status': converted_results.get('status'),
                'schedule': converted_results.get('schedule', {}),
                'total_patients_served': converted_results.get('total_patients_served', 0),
                'total_patient_demand': provider_demand,
                'summary_stats': converted_results.get('summary_stats', {}),
                'daily_travel_times': converted_results.get('daily_travel_times', {}),
                # ... and other fields
            }

            # ⬇️⬇️ NEW: Generate ICS calendar file ⬇️⬇️
            try:
                ics_filename = generate_ics_from_schedule(
                    formatted_results, 
                    selected_provider,
                    output_filename="schedule.ics"
                )
                print(f"✅ Generated calendar file: {ics_filename}")
            except Exception as e:
                print(f"⚠️ Warning: Could not generate ICS file: {e}")
                import traceback
                traceback.print_exc()
                # Continue anyway - don't fail the whole request
            # ⬆️⬆️ ----------------------------------------- ⬆️⬆️

            return jsonify({
                'success': True,
                'results': formatted_results
            })

        else:
            # Full business line optimization logic remains here...
            # This part will be triggered by your advanced frontend.
            # (Code for this mode is omitted for brevity but would be the same as in your original file)
            return jsonify({'success': False,
                            'error': 'Full business line optimization is not shown in this snippet but would run here.'})

    except Exception as e:
        print(f"Error in optimization: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500
    
@app.route('/send_email', methods=['POST'])
def send_email():
    data = request.json
    recipient_email = data.get('email')
    
    if not recipient_email:
        return jsonify({"status": "error", "message": "No email provided"}), 400

    # ⬇️⬇️ UPDATED: Load credentials from environment variables ⬇️⬇️
    SENDER_EMAIL = os.getenv('SENDER_EMAIL')
    SENDER_PASSWORD = os.getenv('SENDER_PASSWORD')
    
    # Validate that credentials exist
    if not SENDER_EMAIL or not SENDER_PASSWORD:
        return jsonify({
            "status": "error", 
            "message": "Email credentials not configured. Please check your .env file."
        }), 500
    
    print(f"DEBUG: Attempting to send email from {SENDER_EMAIL}")
    # ⬆️⬆️ --------------------------------------------------------- ⬆️⬆️

    try:
        msg = MIMEMultipart()
        msg['From'] = SENDER_EMAIL
        msg['To'] = recipient_email
        msg['Subject'] = "My Current Schedule is waiting for your confirmation"
        
        # ⬇️⬇️ UPDATED EMAIL BODY TEXT ⬇️⬇️
        body = (
            "Here is the schedule I requested.\n"
            "Please check that and want to get your confirmation."
        )
        msg.attach(MIMEText(body, 'plain'))
        # ⬆️⬆️ ----------------------- ⬆️⬆️

        # Try to find the ICS file
        filename = "schedule.ics" 
        if not os.path.exists(filename):
            # Fallback: find the newest .ics file in the folder
            files = [f for f in os.listdir('.') if f.endswith('.ics')]
            if files:
                files.sort(key=os.path.getmtime, reverse=True)
                filename = files[0]

        if os.path.exists(filename):
            with open(filename, "rb") as attachment:
                part = MIMEBase("application", "octet-stream")
                part.set_payload(attachment.read())
            
            encoders.encode_base64(part)
            part.add_header(
                "Content-Disposition",
                f"attachment; filename= {filename}",
            )
            msg.attach(part)
            print(f"✅ Attached calendar file: {filename}")
        else:
            print("⚠️ No ICS file found to attach")

        # Send the email
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        text = msg.as_string()
        server.sendmail(SENDER_EMAIL, recipient_email, text)
        server.quit()

        return jsonify({"status": "success", "message": f"Email sent to {recipient_email}"})

    except Exception as e:
        print(f"Email Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# Add all other endpoints from your advanced app.py here...
# (e.g., /api/data_parameters, /api/business_lines, /api/save_schedule, etc.)
# They are omitted here for brevity but should be included for the other frontend to work.

if __name__ == '__main__':
    print("Starting Healthcare Provider Scheduling Backend (Unified Version)...")
    app.run(debug=True, host='0.0.0.0', port=5001)