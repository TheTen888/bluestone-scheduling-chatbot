#!/usr/bin/env python3
"""
Business Line Schedule Optimization using OR-Tools.
Runs optimization for single provider or entire business line and saves results.
Usage: python business_line_optimize_ortools.py
"""

import pandas as pd
import numpy as np
import sys
import os
import time
import json
from datetime import datetime

# Add the parent directory to Python path so we can import from models
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.ortools_travel_optimized_model import create_and_solve_optimization_model
from models.dataloader import load_pcp_facility_data, load_distance_matrices, load_provider_unavailable_dates
from utils.quick_optimize_ortools import extract_patient_data_for_provider

# CONFIGURATION - Change these values
TARGET_PROVIDER_ID = None              # Set to "P79" for single provider, None for full business line
BUSINESS_LINE = "Wisconsin Geriatrics"  # Business line
CENSUS_MONTH = "2024-12"               # Month to optimize
MAX_PATIENTS_PER_DAY = 17             # Maximum patients per provider per day
LAMBDA_PARAM = 0           # Workload balancing weight (higher = more balanced)
LAMBDA_FACILITY = 0.1      # Facility visit gap penalty weight (higher = more frequent visits)
ALPHA = 0.05               # Service level buffer (0.05 = 5% buffer for 105% of census)
FACILITY_VISIT_WINDOW = 10 # Facility visit gap penalty window (working days)
UNAVAILABLE_DATES_FILE = "data/provider_unavailable_dates.csv"  # Optional: provider unavailable dates

# OUTPUT CONFIGURATION
OUTPUT_DIR = "results/schedules"       # Directory to save results
SAVE_JSON = True                       # Save detailed JSON results
SAVE_CSV = True                        # Save CSV schedule summary
SAVE_SUMMARY = True                    # Save human-readable summary

def ensure_output_dir():
    """Create output directories if they don't exist."""
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        print(f"Created output directory: {OUTPUT_DIR}")
    

def extract_patient_data_for_business_line(pcp_data, census_month):
    """Extract patient census data for entire business line from PCP_Facility data."""
    try:
        business_line_data = pcp_data['business_line_data']
        
        # Check if the month exists in the data
        if census_month not in business_line_data.columns:
            print(f"WARNING: Month {census_month} not found in PCP_Facility data")
            return None
        
        print(f"Business line has {len(pcp_data['unique_facilities'])} facilities")
        
        provider_facility_demands = {}
        total_demand = 0
        
        for _, row in business_line_data.iterrows():
            provider_id = row['Anonymized_PCP_UID']
            facility_id = row['Anonymized_Facility_UID']
            patient_count = int(row[census_month])
            
            provider_facility_demands[(provider_id, facility_id)] = patient_count
            total_demand += patient_count
            
            if patient_count > 0:
                print(f"  {provider_id} -> {facility_id}: {patient_count} patients")
        
        # Create patient counts array aligned with facility mappings
        patient_counts = []
        facility_patient_totals = {}
        for facility_id in pcp_data['unique_facilities']:
            facility_total = 0
            for provider_id in pcp_data['unique_providers']:
                provider_demand = provider_facility_demands.get((provider_id, facility_id), 0)
                facility_total += provider_demand
            
            patient_counts.append(facility_total)
            facility_patient_totals[facility_id] = facility_total
            
            if facility_total > 0:
                print(f"  {facility_id} total: {facility_total} patients")
        
        print(f"Total business line demand: {total_demand} patients")
        
        return {
            'patient_counts': patient_counts,
            'facility_ids': pcp_data['unique_facilities'],
            'total_demand': total_demand,
            'source': 'business_line_provider_specific',
            'month': census_month,
            'provider_facility_demands': provider_facility_demands,
            'facility_totals': facility_patient_totals
        }
        
    except Exception as e:
        print(f"ERROR: Failed to extract business line patient data: {e}")
        return None


def save_results(results, pcp_data, optimization_time, mode="business_line"):
    """Save optimization results in multiple formats."""
    ensure_output_dir()
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    census_month_clean = CENSUS_MONTH.replace("-", "")
    
    if mode == "single_provider":
        base_filename = f"{TARGET_PROVIDER_ID}_{census_month_clean}_{timestamp}"
    else:
        base_filename = f"{BUSINESS_LINE.replace(' ', '_').lower()}_{census_month_clean}_{timestamp}"
    
    saved_files = []
    
    # Save detailed JSON results
    if SAVE_JSON:
        json_file = os.path.join(OUTPUT_DIR, f"{base_filename}.json")
        
        results_with_meta = results.copy()
        results_with_meta['optimization_metadata'] = {
            'optimization_time_seconds': optimization_time,
            'generated_at': datetime.now().isoformat(),
            'configuration': {
                'business_line': BUSINESS_LINE,
                'census_month': CENSUS_MONTH,
                'max_patients_per_day': MAX_PATIENTS_PER_DAY,
                'lambda_param': LAMBDA_PARAM,
                'lambda_facility': LAMBDA_FACILITY,
                'alpha': ALPHA,
                'facility_visit_window': FACILITY_VISIT_WINDOW,
                'target_provider': TARGET_PROVIDER_ID,
                'mode': mode
            }
        }
        
        with open(json_file, 'w') as f:
            json.dump(results_with_meta, f, indent=2, default=str)
        saved_files.append(json_file)
        print(f"Saved detailed results: {json_file}")
    
    # Save CSV schedule summary
    if SAVE_CSV and 'schedule' in results:
        csv_file = os.path.join(OUTPUT_DIR, f"{base_filename}_schedule.csv")
        
        # Convert schedule to flat CSV format
        schedule_rows = []
        for provider_key, provider_schedule in results['schedule'].items():
            # Use provider key directly if it's already a real ID, or map from index
            if provider_key.startswith('provider_'):
                provider_id = provider_key.replace('provider_', '')
                provider_original_id = None
                for orig_id, idx in pcp_data['provider_mappings'].items():
                    if str(idx) == provider_id:
                        provider_original_id = orig_id
                        break
            else:
                provider_original_id = provider_key
            
            for date, facilities in provider_schedule.items():
                for facility_key, patients in facilities.items():
                    if patients > 0:
                        if facility_key.startswith('facility_'):
                            facility_idx = int(facility_key.replace('facility_', ''))
                            facility_original_id = pcp_data['unique_facilities'][facility_idx]
                        else:
                            facility_original_id = facility_key
                        
                        schedule_rows.append({
                            'Provider_ID': provider_original_id or f"P{provider_id}",
                            'Date': date,
                            'Facility_ID': facility_original_id,
                            'Patients': patients
                        })
        
        if schedule_rows:
            schedule_df = pd.DataFrame(schedule_rows)
            schedule_df = schedule_df.sort_values(['Provider_ID', 'Date', 'Facility_ID'])
            schedule_df.to_csv(csv_file, index=False)
            saved_files.append(csv_file)
            print(f"Saved CSV schedule: {csv_file}")
    
    # Save human-readable summary
    if SAVE_SUMMARY:
        summary_file = os.path.join(OUTPUT_DIR, f"{base_filename}_summary.txt")
        
        with open(summary_file, 'w') as f:
            f.write(f"=== {BUSINESS_LINE.upper()} OPTIMIZATION SUMMARY ===\n")
            f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Census Month: {CENSUS_MONTH}\n")
            f.write(f"Mode: {mode.replace('_', ' ').title()}\n")
            if TARGET_PROVIDER_ID:
                f.write(f"Target Provider: {TARGET_PROVIDER_ID}\n")
            f.write(f"Optimization Time: {optimization_time:.3f} seconds\n")
            f.write(f"Status: {results.get('status', 'Unknown')}\n\n")
            
            if results.get('status') in ['Optimal', 'Feasible (Time Limit)']:
                f.write("=== OPTIMIZATION RESULTS ===\n")
                f.write(f"Total Patients Served: {results.get('total_patients_served', 'N/A')}\n")
                f.write(f"Total Patient Demand: {results.get('total_patient_demand', 'N/A')}\n")
                f.write(f"Overall Utilization: {results.get('overall_utilization', 'N/A')}%\n")
                f.write(f"Total Travel Time: {results.get('total_travel_time', 'N/A')} hours\n")
                f.write(f"  - Home to Facility: {results.get('home_to_facility_travel', 'N/A')} hours\n")
                f.write(f"  - Facility to Facility: {results.get('facility_to_facility_travel', 'N/A')} hours\n")
                f.write(f"Max Daily Workload: {results.get('max_daily_workload', 'N/A')} patients\n")
                f.write(f"Objective Value: {results.get('objective_value', 'N/A'):.2f}\n\n")
                
                # Provider utilization summary
                if 'provider_utilization' in results:
                    f.write("=== PROVIDER UTILIZATION ===\n")
                    for provider_key, utilization in results['provider_utilization'].items():
                        provider_id = provider_key.replace('provider_', '')
                        # Map back to original provider ID
                        provider_original_id = None
                        for orig_id, idx in pcp_data['provider_mappings'].items():
                            if str(idx) == provider_id:
                                provider_original_id = orig_id
                                break
                        f.write(f"{provider_original_id or f'P{provider_id}'}: {utilization}%\n")
                    f.write("\n")
                
                # Availability info for single provider
                if mode == "single_provider":
                    availability_info = results.get('metadata', {}).get('provider_availability', {})
                    if availability_info:
                        f.write("=== PROVIDER AVAILABILITY ===\n")
                        f.write(f"Total working days in month: {availability_info['total_calendar_days']}\n")
                        f.write(f"Available days: {availability_info['available_days']}\n")
                        f.write(f"Unavailable days: {availability_info['unavailable_days']}\n")
                        if availability_info['unavailable_dates_list']:
                            f.write("Unavailable dates:\n")
                            for date in availability_info['unavailable_dates_list']:
                                f.write(f"  {date}\n")
                        f.write("\n")
            else:
                f.write(f"Optimization failed: {results.get('message', 'Unknown error')}\n")
        
        saved_files.append(summary_file)
        print(f"Saved summary: {summary_file}")
    
    return saved_files

def optimize_single_provider(provider_id, pcp_data, distance_data, unavailable_dates):
    """
    Optimize a single provider using the same logic as quick_optimize_ortools.py
    """
    print(f"\n--- Optimizing {provider_id} ---")
    
    # Get provider index
    provider_index = pcp_data['provider_mappings'][provider_id]
    
    # Extract patient data for this specific provider
    patient_data = extract_patient_data_for_provider(pcp_data, CENSUS_MONTH, provider_id)
    
    if not patient_data:
        print(f"ERROR: Failed to extract patient data for {provider_id}")
        return None
    
    print(f"  {provider_id} serves {len([f for f in patient_data['patient_counts'] if f > 0])} facilities")
    print(f"  Total demand: {patient_data['total_demand']} patients")
    
    # Run individual optimization
    results = create_and_solve_optimization_model(
        providers=len(pcp_data['provider_mappings']),
        facilities=len(pcp_data['facility_mappings']),
        business_line=BUSINESS_LINE,
        census_month=CENSUS_MONTH,
        target_provider=provider_index,  # Single provider mode
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
    
    # Add provider ID to results for tracking
    if results.get('status') in ['Optimal', 'Feasible (Time Limit)']:
        results['provider_id'] = provider_id
        results['provider_index'] = provider_index
        travel_time = results.get('total_travel_time', 0)
        patients_served = results.get('total_patients_served', 0)
        objective_value = results.get('objective_value', 0)
        print(f"  ✅ {provider_id}: {patients_served} patients, {travel_time:.2f}h travel, objective: {objective_value:.2f}")
        return results
    else:
        print(f"  ❌ {provider_id}: Optimization failed - {results.get('message', 'Unknown error')}")
        return None

def combine_provider_results(provider_results, pcp_data):
    """
    Combine individual provider optimization results into a unified business line result.
    
    Args:
        provider_results (list): List of individual provider optimization results
        pcp_data (dict): Business line data containing provider/facility mappings
        
    Returns:
        dict: Unified business line results with real IDs and aggregated metrics
    """
    print(f"\n=== COMBINING RESULTS FROM {len(provider_results)} PROVIDERS ===")
    
    # Initialize combined results structure
    combined_results = {
        'status': 'Combined Sequential Optimization',
        'optimization_method': 'sequential_individual_providers',
        'schedule': {},
        'provider_utilization': {},
        'daily_travel_times': {},
        'total_patients_served': 0,
        'total_patient_demand': 0,
        'total_travel_time': 0.0,
        'home_to_facility_travel': 0.0,
        'facility_to_facility_travel': 0.0,
        'provider_results_summary': []
    }
    
    # Convert each provider result to use real IDs and merge into combined dataset
    from models.dataloader import convert_optimization_results_to_real_ids
    
    for result in provider_results:
        provider_id = result['provider_id']
        
        # Apply standard ID conversion to maintain consistency with single provider mode
        converted_result = convert_optimization_results_to_real_ids(result, pcp_data)
        
        # Merge converted schedule data into combined results
        if 'schedule' in converted_result and converted_result['schedule']:
            combined_results['schedule'].update(converted_result['schedule'])
        
        # Merge provider utilization data
        if 'provider_utilization' in converted_result and converted_result['provider_utilization']:
            combined_results['provider_utilization'].update(converted_result['provider_utilization'])
        
        # Merge daily travel times
        if 'daily_travel_times' in converted_result and converted_result['daily_travel_times']:
            combined_results['daily_travel_times'].update(converted_result['daily_travel_times'])
        
        # Sum up totals
        combined_results['total_patients_served'] += result.get('total_patients_served', 0)
        combined_results['total_patient_demand'] += result.get('total_patient_demand', 0)
        provider_travel = result.get('total_travel_time', 0.0)
        provider_home_travel = result.get('home_to_facility_travel', 0.0)
        provider_facility_travel = result.get('facility_to_facility_travel', 0.0)
        
        print(f"    {provider_id} travel breakdown: Total={provider_travel:.2f}h, Home-Facility={provider_home_travel:.2f}h, Facility-Facility={provider_facility_travel:.2f}h")
        
        combined_results['total_travel_time'] += provider_travel
        combined_results['home_to_facility_travel'] += provider_home_travel
        combined_results['facility_to_facility_travel'] += provider_facility_travel
        
        # Track individual provider summary
        combined_results['provider_results_summary'].append({
            'provider_id': provider_id,
            'provider_index': result.get('provider_index'),
            'patients_served': result.get('total_patients_served', 0),
            'travel_time': result.get('total_travel_time', 0.0),
            'utilization': converted_result.get('provider_utilization', {}).get(provider_id, 0),
            'status': result.get('status', 'Unknown')
        })
    
    # Calculate overall utilization
    total_providers = len(provider_results)
    if total_providers > 0:
        # Assume 22 working days and max patients per day for capacity calculation
        total_capacity = total_providers * 22 * MAX_PATIENTS_PER_DAY
        combined_results['overall_utilization'] = round(
            (combined_results['total_patients_served'] / total_capacity) * 100, 1
        ) if total_capacity > 0 else 0
    
    # Add metadata - get working_days_list from first successful provider result
    base_metadata = {}
    for result in provider_results:
        if result.get('metadata'):
            base_metadata = result['metadata']
            break
    
    combined_results['metadata'] = {
        'model_type': 'sequential_individual_provider_optimization',
        'business_line': BUSINESS_LINE,
        'census_month': CENSUS_MONTH,
        'optimization_method': 'sequential',
        'providers_optimized': total_providers,
        'successful_optimizations': len([r for r in provider_results if r.get('status') in ['Optimal', 'Feasible (Time Limit)']]),
        'configuration': {
            'max_patients_per_day': MAX_PATIENTS_PER_DAY,
            'lambda_param': LAMBDA_PARAM,
            'lambda_facility': LAMBDA_FACILITY,
            'alpha': ALPHA,
            'facility_visit_window': FACILITY_VISIT_WINDOW
        },
        'working_days': base_metadata.get('working_days', 0),
        'date_range': base_metadata.get('date_range', ''),
        'scheduling_month': base_metadata.get('scheduling_month', ''),
        'data_source': base_metadata.get('data_source', 'real_census_data'),
        'travel_optimization': base_metadata.get('travel_optimization', True)
    }
    
    return combined_results


def main():
    print(f"=== {BUSINESS_LINE.upper()} SEQUENTIAL OPTIMIZATION ===")
    print(f"Mode: Sequential Individual Provider Optimization")
    print(f"Census Month: {CENSUS_MONTH}")
    print("=" * 60)
    
    # Load business line data
    pcp_data = load_pcp_facility_data(
        csv_path="data/anonymized/PCP_Facility.csv",
        business_line=BUSINESS_LINE
    )
    
    if not pcp_data:
        print(f"ERROR: No data found for {BUSINESS_LINE}")
        return
    
    # Load distance matrices (shared across all providers)
    print("Loading distance matrices...")
    distance_data = load_distance_matrices(BUSINESS_LINE)
    
    # Load provider unavailable dates (shared across all providers)
    print("Loading provider availability...")
    unavailable_dates = load_provider_unavailable_dates(UNAVAILABLE_DATES_FILE, pcp_data)
    
    total_providers = len(pcp_data['unique_providers'])
    print(f"\nFound {total_providers} providers in {BUSINESS_LINE}")
    print(f"Configuration: max_patients_per_day={MAX_PATIENTS_PER_DAY}, lambda_workload={LAMBDA_PARAM}, lambda_facility={LAMBDA_FACILITY}, alpha={ALPHA}, facility_window={FACILITY_VISIT_WINDOW}")
    
    # Start total optimization timer
    total_start_time = time.time()
    
    # Run sequential individual optimizations
    provider_results = []
    successful_optimizations = 0
    failed_optimizations = 0
    
    for provider_id in sorted(pcp_data['unique_providers']):
        provider_result = optimize_single_provider(
            provider_id, pcp_data, distance_data, unavailable_dates
        )
        
        if provider_result:
            provider_results.append(provider_result)
            successful_optimizations += 1
        else:
            failed_optimizations += 1
    
    # Calculate total optimization time
    total_optimization_time = time.time() - total_start_time
    
    # Combine all individual results into business line result
    if provider_results:
        combined_results = combine_provider_results(provider_results, pcp_data)
        
        # Display summary results
        print(f"\n=== BUSINESS LINE OPTIMIZATION COMPLETED ===")
        print(f"⏱️  Total Time: {total_optimization_time:.3f} seconds")
        print(f"📊 Successful Optimizations: {successful_optimizations}/{total_providers}")
        print(f"❌ Failed Optimizations: {failed_optimizations}")
        print(f"👥 Total Patients: {combined_results.get('total_patients_served', 'N/A')}")
        print(f"🎯 Overall Utilization: {combined_results.get('overall_utilization', 'N/A')}%")
        print(f"🚗 Total Travel Time: {combined_results.get('total_travel_time', 'N/A'):.2f} hours")
        
        # Save combined results
        print(f"\n=== SAVING COMBINED RESULTS ===")
        saved_files = save_results(combined_results, pcp_data, total_optimization_time, "business_line_sequential")
        print(f"✅ Saved {len(saved_files)} files to {OUTPUT_DIR}/")
        
        
        # Show provider summary with travel breakdown
        print(f"\n=== PROVIDER SUMMARY ===")
        for summary in combined_results['provider_results_summary']:
            provider_id = summary['provider_id']
            travel_time = summary['travel_time']
            patients_served = summary['patients_served']
            utilization = summary['utilization']
            
            print(f"  ✅ {provider_id}: {patients_served} patients, {travel_time:.2f}h travel, {utilization}% util")
            
            # Show travel breakdown if available in the individual results
            for result in provider_results:
                if result.get('provider_id') == provider_id:
                    home_travel = result.get('home_to_facility_travel', 0)
                    facility_travel = result.get('facility_to_facility_travel', 0)
                    print(f"    {provider_id} travel breakdown: Total={travel_time:.2f}h, Home-Facility={home_travel:.2f}h, Facility-Facility={facility_travel:.2f}h")
                    break
        
    else:
        print(f"❌ All provider optimizations failed!")

if __name__ == "__main__":
    main()