"""
Data loading utilities for optimization models.

Handles loading PCP-facility data, distance matrices, patient data, and provider availability.
Shared across all optimization model implementations (OR-Tools, Gurobi, Pyomo).
"""

import pandas as pd
import numpy as np
from typing import Dict, Any, Optional
import calendar
from datetime import datetime, timedelta

def get_travel_time_pcp_to_facility(provider_idx, facility_idx, pcp_facility_df, idx_to_provider, idx_to_facility):
    """Get travel time from provider to facility using distance matrix."""
    provider_id = idx_to_provider.get(provider_idx)
    facility_id = idx_to_facility.get(facility_idx)
    
    if provider_id and facility_id and provider_id in pcp_facility_df.index and facility_id in pcp_facility_df.columns:
        travel_time = pcp_facility_df.loc[provider_id, facility_id]
        if not pd.isna(travel_time):
            return travel_time
    return 0.0

def get_travel_time_facility_to_facility(facility1_idx, facility2_idx, facility_facility_df, idx_to_facility):
    """Get travel time between two facilities using distance matrix."""
    facility1_id = idx_to_facility.get(facility1_idx)
    facility2_id = idx_to_facility.get(facility2_idx)
    
    if facility1_id and facility2_id and facility1_id in facility_facility_df.index and facility2_id in facility_facility_df.columns:
        travel_time = facility_facility_df.loc[facility1_id, facility2_id]
        if not pd.isna(travel_time):
            return travel_time
    return 0.0

def load_pcp_facility_data(csv_path: str, business_line: str) -> Dict[str, Any]:
    """
    Load and process PCP-Facility pairing data for a specific business line.
    
    Args:
        csv_path: Path to the Anonymized_PCP_Facility.csv file
        business_line: Business line to filter for (e.g., "Wisconsin Geriatrics")
    
    Returns:
        Dictionary containing provider-facility mappings and valid pairs
    """
    try:
        # Load the CSV data
        df = pd.read_csv(csv_path)
        
        # Filter for the specified business line
        business_line_data = df[df['Business Line'] == business_line].copy()
        
        if business_line_data.empty:
            print(f"WARNING: No data found for business line: {business_line}")
            return {}
        
        # Additional filtering for Wisconsin Geriatrics based on provider assignments
        if business_line == "Wisconsin Geriatrics":
            try:
                # Load the Wisconsin facility-provider assignments
                assignments_path = "data/anonymized/Wisconsin_Geriatrics_assignments.csv"
                assignments_df = pd.read_csv(assignments_path)
                
                # Create a set of valid (provider, facility) pairs from assignments
                valid_assignments = set(
                    zip(assignments_df['Anonymized_PCP_UID'], assignments_df['Anonymized_Facility_UID'])
                )
                
                print(f"   Wisconsin filter: {len(valid_assignments)} valid provider-facility assignments loaded")
                
                # Filter business_line_data to only include pairs that exist in assignments
                business_line_data['pair_tuple'] = list(zip(
                    business_line_data['Anonymized_PCP_UID'], 
                    business_line_data['Anonymized_Facility_UID']
                ))
                
                original_count = len(business_line_data)
                business_line_data = business_line_data[
                    business_line_data['pair_tuple'].isin(valid_assignments)
                ].copy()
                
                # Drop the temporary column
                business_line_data = business_line_data.drop('pair_tuple', axis=1)
                
                filtered_count = len(business_line_data)
                print(f"   Wisconsin filter: {original_count} -> {filtered_count} pairs after assignment filtering")
                
                if business_line_data.empty:
                    print(f"WARNING: No valid assignments found for Wisconsin Geriatrics")
                    return {}
                    
            except Exception as e:
                print(f"WARNING: Could not load Wisconsin assignments file: {e}")
                print("   Proceeding without Wisconsin-specific filtering")
        
        # Extract unique providers and facilities
        unique_providers = sorted(business_line_data['Anonymized_PCP_UID'].unique())
        unique_facilities = sorted(business_line_data['Anonymized_Facility_UID'].unique())
        
        # Create index mappings
        provider_to_idx = {provider: idx for idx, provider in enumerate(unique_providers)}
        facility_to_idx = {facility: idx for idx, facility in enumerate(unique_facilities)}
        
        # Create provider-facility pairs (indexed)
        provider_facility_pairs = []
        for _, row in business_line_data.iterrows():
            provider_idx = provider_to_idx[row['Anonymized_PCP_UID']]
            facility_idx = facility_to_idx[row['Anonymized_Facility_UID']]
            provider_facility_pairs.append((provider_idx, facility_idx))
        
        return {
            'provider_facility_pairs': provider_facility_pairs,
            'provider_mappings': provider_to_idx,
            'facility_mappings': facility_to_idx,
            'unique_providers': unique_providers,
            'unique_facilities': unique_facilities,
            'business_line': business_line,
            'total_pairs': len(provider_facility_pairs),
            'business_line_data': business_line_data
        }
        
    except Exception as e:
        print(f"ERROR: Error loading PCP-Facility data: {str(e)}")
        return {}

def load_distance_matrices(business_line):
    """Load distance matrices for travel time optimization."""
    try:
        business_line_clean = business_line.replace(" ", "_")
        
        # Load PCP-Facility distances, keeping original IDs as index/columns
        pcp_facility_path = f"data/anonymized/distance_matrices/{business_line_clean}_pcp_facility_durations.csv"
        pcp_facility_df = pd.read_csv(pcp_facility_path, index_col=0)
        
        # Load Facility-Facility distances, keeping original IDs as index/columns
        facility_facility_path = f"data/anonymized/distance_matrices/{business_line_clean}_facility_facility_durations.csv"
        facility_facility_df = pd.read_csv(facility_facility_path, index_col=0)
        
        return {
            'pcp_facility_df': pcp_facility_df,
            'facility_facility_df': facility_facility_df,
            'source': 'real_distance_data_dataframes'
        }
        
    except Exception as e:
        print(f"WARNING: Failed to load distance matrices for {business_line}: {e}")
        return None

def get_working_days_for_month(year: int, month: int):
    """Get all working days (Monday-Friday) for a given month."""
    working_days = []
    
    # Get the number of days in the month
    num_days = calendar.monthrange(year, month)[1]
    
    # Iterate through all days in the month
    for day in range(1, num_days + 1):
        date = datetime(year, month, day)
        # Monday = 0, Friday = 4, Saturday = 5, Sunday = 6
        if date.weekday() < 5:  # Monday through Friday
            working_days.append(date)
    
    return working_days

def load_provider_unavailable_dates(csv_path: str, pcp_facility_data: Dict[str, Any]) -> set:
    """
    Load provider unavailable dates from CSV file.
    
    Args:
        csv_path: Path to the provider_unavailable_dates.csv file
        pcp_facility_data: PCP facility data containing provider mappings
    
    Returns:
        Set of (provider_idx, date_str) tuples for unavailable dates
    """
    try:
        if not csv_path:
            return set()
            
        # Try to load the CSV file
        df = pd.read_csv(csv_path)
        
        if df.empty:
            print("   No unavailable dates specified")
            return set()
        
        # Get provider mappings for index conversion
        provider_mappings = pcp_facility_data.get('provider_mappings', {})
        
        unavailable_dates = set()
        
        for _, row in df.iterrows():
            provider_id = row['Anonymized_PCP_UID']
            date_str = row['Date']
            
            # Convert provider ID to index
            if provider_id in provider_mappings:
                provider_idx = provider_mappings[provider_id]
                unavailable_dates.add((provider_idx, date_str))
            else:
                print(f"   WARNING: Provider {provider_id} not found in business line data")
        
        print(f"   Loaded {len(unavailable_dates)} unavailable date entries")
        return unavailable_dates
        
    except FileNotFoundError:
        print(f"   No unavailable dates file found at {csv_path} - using default availability")
        return set()
    except Exception as e:
        print(f"   WARNING: Error loading unavailable dates from {csv_path}: {e}")
        return set()


def _convert_provider_key_to_real_id(provider_key, reverse_provider_mapping):
    """Helper function to convert provider keys from indexed to real IDs."""
    if provider_key.startswith('provider_'):
        provider_idx = int(provider_key.split('_')[1])
        return reverse_provider_mapping.get(provider_idx, provider_key)
    return provider_key

def _convert_facility_key_to_real_id(facility_key, reverse_facility_mapping):
    """Helper function to convert facility keys from indexed to real IDs."""
    if facility_key.startswith('facility_'):
        facility_idx = int(facility_key.split('_')[1])
        return reverse_facility_mapping.get(facility_idx, facility_key)
    return facility_key

def convert_optimization_results_to_real_ids(results, pcp_data):
    """
    Convert optimization results from indexed keys to real provider/facility IDs.
    
    Converts indexed keys (provider_0, facility_14) to real IDs (P79, F602) for frontend compatibility.
    
    Args:
        results (dict): Optimization results containing schedule, utilization, and travel data
        pcp_data (dict): Business line data with provider_mappings and facility_mappings
        
    Returns:
        dict: Results dictionary with real provider/facility IDs as keys
    """
    if not results or not pcp_data:
        return results
    
    # Create reverse mappings from index to real ID
    reverse_facility_mapping = {idx: fid for fid, idx in pcp_data.get('facility_mappings', {}).items()}
    reverse_provider_mapping = {idx: pid for pid, idx in pcp_data.get('provider_mappings', {}).items()}
    
    converted_results = results.copy()
    
    # Convert schedule from indexed keys to real IDs
    if 'schedule' in results and results['schedule']:
        converted_schedule = {}
        
        for provider_key, provider_data in results['schedule'].items():
            real_provider_id = _convert_provider_key_to_real_id(provider_key, reverse_provider_mapping)
            
            converted_provider_data = {}
            for date, facilities in provider_data.items():
                converted_facilities = {}
                
                for facility_key, patients in facilities.items():
                    real_facility_id = _convert_facility_key_to_real_id(facility_key, reverse_facility_mapping)
                    
                    converted_facilities[real_facility_id] = patients
                
                converted_provider_data[date] = converted_facilities
            
            converted_schedule[real_provider_id] = converted_provider_data
        
        converted_results['schedule'] = converted_schedule
    
    # Convert provider_utilization from indexed keys to real IDs
    if 'provider_utilization' in results and results['provider_utilization']:
        converted_utilization = {}
        
        for provider_key, utilization in results['provider_utilization'].items():
            real_provider_id = _convert_provider_key_to_real_id(provider_key, reverse_provider_mapping)
                
            converted_utilization[real_provider_id] = utilization
        
        converted_results['provider_utilization'] = converted_utilization
    
    # Convert daily_travel_times from indexed keys to real IDs
    if 'daily_travel_times' in results and results['daily_travel_times']:
        converted_travel_times = {}
        
        for provider_key, travel_data in results['daily_travel_times'].items():
            real_provider_id = _convert_provider_key_to_real_id(provider_key, reverse_provider_mapping)
                
            converted_travel_times[real_provider_id] = travel_data
        
        converted_results['daily_travel_times'] = converted_travel_times
    
    return converted_results


def convert_single_provider_results_to_real_ids(results, pcp_data, selected_provider_id):
    """
    Convert single provider optimization results to use real provider/facility IDs.
    
    Specialized conversion for single provider mode that ensures the selected provider
    ID is used as the primary key in all result structures. This maintains consistency
    with the provider selection interface.
    
    Args:
        results (dict): Single provider optimization results with indexed keys
        pcp_data (dict): Business line data containing ID mappings
        selected_provider_id (str): Real provider ID (e.g., 'P79') that was optimized
        
    Returns:
        dict: Results with real IDs and selected_provider_id as primary key
        
    Example:
        Input: results['schedule']['provider_0']['2024-12-02']['facility_14'] = 6
        Output: results['schedule']['P79']['2024-12-02']['F602'] = 6
    """
    # Use the general conversion function
    converted_results = convert_optimization_results_to_real_ids(results, pcp_data)
    
    # For single provider mode, ensure the schedule uses the selected provider ID as key
    if 'schedule' in converted_results and converted_results['schedule']:
        # Find the provider data (should be only one provider in single provider mode)
        provider_data = None
        for provider_key, data in converted_results['schedule'].items():
            provider_data = data
            break
        
        if provider_data is not None:
            # Replace the schedule with the selected provider ID as key
            converted_results['schedule'] = {selected_provider_id: provider_data}
    
    # Update utilization to use selected provider ID
    if 'provider_utilization' in converted_results and converted_results['provider_utilization']:
        utilization_data = None
        for provider_key, utilization in converted_results['provider_utilization'].items():
            utilization_data = utilization
            break
        
        if utilization_data is not None:
            converted_results['provider_utilization'] = {selected_provider_id: utilization_data}
    
    # Update travel times to use selected provider ID
    if 'daily_travel_times' in converted_results and converted_results['daily_travel_times']:
        travel_data = None
        for provider_key, data in converted_results['daily_travel_times'].items():
            travel_data = data
            break
        
        if travel_data is not None:
            converted_results['daily_travel_times'] = {selected_provider_id: travel_data}
    
    return converted_results