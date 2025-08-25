#!/usr/bin/env python3
"""
Quick script to optimize a single provider using OR-Tools model.
Simple usage: python quick_optimize_ortools.py
"""

import pandas as pd
import numpy as np
import sys
import os
import time

# Add the parent directory to Python path so we can import from models
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.ortools_travel_optimized_model import create_and_solve_optimization_model
from models.dataloader import load_pcp_facility_data, load_distance_matrices, load_provider_unavailable_dates

# CONFIGURATION - Change these values
PROVIDER_ID = "P79"                    # Provider to optimize
BUSINESS_LINE = "Wisconsin Geriatrics"  # Business line
CENSUS_MONTH = "2024-12"               # Month to optimize
MAX_PATIENTS_PER_DAY = 20             # Maximum patients per provider per day
LAMBDA_PARAM = 0           # Workload balancing weight (higher = more balanced)
LAMBDA_FACILITY = 0       # Facility visit gap penalty weight (higher = more frequent visits)
ALPHA = 0.05               # Service level buffer (0.05 = 5% buffer for 105% of census)
FACILITY_VISIT_WINDOW = 10              # Facility visit gap penalty window (working days)
UNAVAILABLE_DATES_FILE = "data/provider_unavailable_dates.csv"  # Optional: provider unavailable dates

def extract_patient_data_for_provider(pcp_data, census_month, target_provider_id):
    """Extract patient census data for a specific provider from PCP_Facility data."""
    try:
        business_line_data = pcp_data['business_line_data']
        
        # Check if the month exists in the data
        if census_month not in business_line_data.columns:
            print(f"WARNING: Month {census_month} not found in PCP_Facility data")
            return None
        
        # Filter to target provider's facilities and patient counts
        provider_facilities = business_line_data[business_line_data['Anonymized_PCP_UID'] == target_provider_id]
        if provider_facilities.empty:
            print(f"WARNING: No facilities found for provider {target_provider_id}")
            return None
        
        print(f"Provider {target_provider_id} serves {len(provider_facilities)} facilities")
        
        # Extract patient counts for each facility this provider serves
        provider_patient_counts = {}
        total_provider_demand = 0
        
        for _, row in provider_facilities.iterrows():
            facility_id = row['Anonymized_Facility_UID']
            patient_count = int(row[census_month])
            provider_patient_counts[facility_id] = patient_count
            total_provider_demand += patient_count
            if patient_count > 0:
                print(f"  {facility_id}: {patient_count} patients")
        
        # Create patient counts array aligned with facility mappings
        patient_counts = []
        for facility_id in pcp_data['unique_facilities']:
            patient_count = provider_patient_counts.get(facility_id, 0)
            patient_counts.append(patient_count)
        
        print(f"Provider {target_provider_id} total demand: {total_provider_demand} patients")
        
        return {
            'patient_counts': patient_counts,
            'facility_ids': pcp_data['unique_facilities'],
            'provider_facilities': list(provider_patient_counts.keys()),
            'provider_demand': total_provider_demand,
            'source': f'provider_{target_provider_id}_facilities',
            'month': census_month,
            'total_demand': total_provider_demand
        }
        
    except Exception as e:
        print(f"ERROR: Failed to extract patient data for provider {target_provider_id}: {e}")
        return None

def main():
    print(f"Optimizing {PROVIDER_ID} in {BUSINESS_LINE} for {CENSUS_MONTH} using OR-TOOLS")
    print("=" * 70)
    
    # Load business line data
    pcp_data = load_pcp_facility_data(
        csv_path="data/anonymized/PCP_Facility.csv",
        business_line=BUSINESS_LINE
    )
    
    if not pcp_data:
        print(f"ERROR: No data found for {BUSINESS_LINE}")
        return
    
    # Find provider index
    if PROVIDER_ID not in pcp_data['provider_mappings']:
        print(f"ERROR: {PROVIDER_ID} not found in {BUSINESS_LINE}")
        print(f"Available providers: {sorted(pcp_data['unique_providers'])}")
        return
    
    provider_index = pcp_data['provider_mappings'][PROVIDER_ID]
    
    # Extract patient census data for the target provider
    print(f"Finding facilities and patient counts for {PROVIDER_ID}...")
    patient_data = extract_patient_data_for_provider(pcp_data, CENSUS_MONTH, PROVIDER_ID)
    
    # Load distance matrices
    print("Loading distance matrices...")
    distance_data = load_distance_matrices(BUSINESS_LINE)
    
    # Load provider unavailable dates (optional)
    print("Loading provider availability...")
    unavailable_dates = load_provider_unavailable_dates(UNAVAILABLE_DATES_FILE, pcp_data)
    
    # Run optimization
    provider_facilities = patient_data['provider_facilities']
    provider_facility_count = len(provider_facilities)
    
    print(f"Optimizing for {PROVIDER_ID} (index {provider_index}) with {provider_facility_count} facilities")
    
    # Start optimization timer
    start_time = time.time()
    
    results = create_and_solve_optimization_model(
        providers=len(pcp_data['provider_mappings']),
        facilities=len(pcp_data['facility_mappings']),
        business_line=BUSINESS_LINE,
        census_month=CENSUS_MONTH,
        target_provider=provider_index,
        pcp_facility_data=pcp_data,
        patient_data=patient_data,
        distance_data=distance_data,
        max_patients_per_day=MAX_PATIENTS_PER_DAY,
        lambda_param=LAMBDA_PARAM,
        lambda_facility=LAMBDA_FACILITY,
        alpha=ALPHA,
        facility_visit_window=FACILITY_VISIT_WINDOW,
        provider_unavailable_dates=unavailable_dates
    )
    
    # Calculate optimization time
    optimization_time = time.time() - start_time
    
    # Show clean results
    print(f"\n=== OR-TOOLS OPTIMIZATION RESULTS FOR {PROVIDER_ID} ===")
    print(f"⏱️  Optimization Time: {optimization_time:.3f} seconds")
    print(f"🎯 Lambda Parameter: {LAMBDA_PARAM} (workload balancing weight)")
    print(f"📈 Alpha Parameter: {ALPHA} (service level buffer: {100*(1+ALPHA):.0f}% of census)")
    t_bar = results.get('T_bar', 'N/A')
    try:
        if isinstance(t_bar, (int, float)):
            print(f"⚖️  T_bar (scaling factor): {t_bar:.3f} hours/patient")
        else:
            print(f"⚖️  T_bar (scaling factor): {t_bar} hours/patient")
    except Exception as e:
        print(f"⚖️  T_bar (scaling factor): Error formatting - {e}")
    
    if results['status'] in ['Optimal', 'Feasible (Time Limit)']:
        provider_key = f"provider_{provider_index}"
        schedule = results['schedule'].get(provider_key, {})
        utilization = results['provider_utilization'].get(provider_key, 0)
        
        # Summary stats
        print(f"Utilization: {utilization}%")
        print(f"Working Days: {len(schedule)} / 20 possible")
        print(f"Total Patients: {results['total_patients_served']}")
        max_workload = results.get('max_daily_workload', 'N/A')
        if isinstance(max_workload, (int, float)) and max_workload > 1000:
            print(f"Max Daily Workload: {int(max_workload)} patients")
        else:
            print(f"Max Daily Workload: {max_workload}")
        print(f"Objective Value: {results.get('objective_value', 'N/A'):.2f}")
        
        # Show objective breakdown
        if results.get('total_travel_time', 0) > 0:
            travel_component = results['total_travel_time']
            workload_component = results['lambda_param'] * results.get('T_bar', 0) * results.get('max_daily_workload', 0)
            print(f"  Travel component: {travel_component:.2f} hours")
            print(f"  Workload component: {workload_component:.2f} hours")
        
        # Show travel time if available (assuming hours, not minutes)
        if results.get('total_travel_time', 0) > 0:
            total_hours = results['total_travel_time']
            print(f"Monthly Travel Time: {total_hours:.1f} hours")
            
            # Show daily travel times
            daily_times = results.get('daily_travel_times', {}).get(provider_key, {})
            if daily_times:
                print(f"\nDaily Travel Times:")
                for day, hours in daily_times.items():
                    if hours > 0:
                        print(f"  {day}: {hours:.1f} hours")
        
        # Show detailed schedule
        print(f"\n=== DETAILED SCHEDULE FOR {PROVIDER_ID} ===")
        if schedule:
            # Handle new date format (YYYY-MM-DD) instead of old week_day format
            from datetime import datetime
            
            # Group days by date for chronological display
            dated_schedule = {}
            for day, facilities in schedule.items():
                if facilities:  # Only show days with assignments
                    try:
                        # Parse date string like "2024-01-15"
                        date_obj = datetime.strptime(day, '%Y-%m-%d')
                        dated_schedule[date_obj] = (day, facilities)
                    except ValueError:
                        # Fallback for old format or other formats
                        print(f"  {day}: {facilities}")
                        continue
            
            # Display schedule in chronological order
            for date_obj in sorted(dated_schedule.keys()):
                day_name, facilities = dated_schedule[date_obj]
                day_label = date_obj.strftime('%A')  # Monday, Tuesday, etc.
                date_str = date_obj.strftime('%Y-%m-%d')
                
                print(f"  {day_label} ({date_str}):")
                
                total_day_patients = 0
                for facility_key, patients in facilities.items():
                    if patients > 0:
                        # Extract facility index and get original facility ID
                        facility_idx = int(facility_key.split('_')[1])
                        facility_id = pcp_data['unique_facilities'][facility_idx]
                        print(f"    {facility_id}: {patients} patients")
                        total_day_patients += patients
                
                print(f"    Total patients this day: {total_day_patients}")
                
                # Show travel time for this day if available
                if daily_times and day_name in daily_times and daily_times[day_name] > 0:
                    print(f"    Travel time: {daily_times[day_name]:.2f} hours")
        else:
            print("No schedule found")
        
        # Calculate facility totals for both summaries
        facility_totals = {}
        for day, facilities in schedule.items():
            for facility_key, patients in facilities.items():
                if patients > 0:
                    facility_idx = int(facility_key.split('_')[1])
                    facility_id = pcp_data['unique_facilities'][facility_idx]
                    facility_totals[facility_id] = facility_totals.get(facility_id, 0) + patients
        
        # Show monthly travel summary first
        if results.get('total_travel_time', 0) > 0:
            total_travel = results['total_travel_time']
            home_to_facility = results.get('home_to_facility_travel', 0)
            facility_to_facility = results.get('facility_to_facility_travel', 0)
            working_days = len(schedule)
            avg_daily_travel = total_travel / working_days if working_days > 0 else 0
            
            print(f"\n=== MONTHLY SUMMARY ===")
            print(f"Working days: {working_days}")
            print(f"Home-to-facility travel: {home_to_facility:.2f} hours")
            print(f"Facility-to-facility travel: {facility_to_facility:.2f} hours")
            print(f"Total monthly travel: {total_travel:.2f} hours")
            print(f"Average daily travel: {avg_daily_travel:.2f} hours")
        
        # Show facility utilization summary
        print(f"\n=== FACILITY UTILIZATION SUMMARY ===")
        for facility_id in sorted(facility_totals.keys()):
            total_patients = facility_totals[facility_id]
            print(f"  {facility_id}: {total_patients} patients (across all visits)")
        
        # Add facility summary section  
        print(f"\n=== FACILITY SUMMARY ===")
        print(f"Unique facilities visited: {len(facility_totals)}")
        print(f"Total patient visits: {sum(facility_totals.values())}")
        print(f"Facilities: {', '.join(sorted(facility_totals.keys()))}")
        
        # Show provider availability information
        availability_info = results.get('metadata', {}).get('provider_availability', {})
        if availability_info:
            print(f"\n=== PROVIDER AVAILABILITY ===")
            print(f"Total working days in month: {availability_info['total_calendar_days']}")
            print(f"Available days: {availability_info['available_days']}")
            print(f"Unavailable days: {availability_info['unavailable_days']}")
            
            if availability_info['unavailable_dates_list']:
                print(f"Unavailable dates:")
                for date in availability_info['unavailable_dates_list']:
                    print(f"  {date}")
        
    else:
        print(f"OR-Tools Optimization Status: {results.get('status', 'Unknown')}")
        print(f"Message: {results.get('message', 'No message available')}")

if __name__ == "__main__":
    main()