#!/usr/bin/env python3
"""
Optimal Travel Calculator (Python Implementation)

This module implements unified travel time calculation using the same optimization 
principles as the Gurobi and OR-Tools models: minimize home-to-facility + 
facility-to-facility travel.

This ensures consistent travel calculations across:
- Scheduler tab (optimization results)
- Visit tab (visit data analysis) 
- Python scripts (post-calculation analysis)

Ported from JavaScript optimal_travel_calculator.js to ensure identical logic.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Any


def calculate_optimal_daily_travel(provider_id: str, facilities: List[Dict], 
                                   pcp_facility_df: pd.DataFrame, 
                                   facility_facility_df: pd.DataFrame) -> Dict[str, Any]:
    """
    Calculate optimal daily travel time for a provider visiting multiple facilities.
    Uses the same logic as optimization models:
    - Home travel: minimum distance to closest facility visited that day
    - Facility-to-facility: optimal routing between facilities
    
    Args:
        provider_id: Provider ID (e.g., "P79")
        facilities: List of facility dicts: [{"facilityId": "F430", "totalVisits": 13}, ...]
        pcp_facility_df: PCP-to-facility distance matrix
        facility_facility_df: Facility-to-facility distance matrix
    
    Returns:
        Dict with travel breakdown: {"homeTravel": float, "facilityTravel": float, 
                                     "totalTravel": float, "details": List[str]}
    """
    if not facilities:
        return {
            "homeTravel": 0.0,
            "facilityTravel": 0.0,
            "totalTravel": 0.0,
            "details": []
        }
    
    details = []
    
    # Step 1: Calculate optimal home travel (minimum distance to any facility visited)
    home_travel = float('inf')
    closest_facility = None
    
    for facility in facilities:
        travel_time = get_travel_time(pcp_facility_df, provider_id, facility["facilityId"])
        if travel_time < home_travel:
            home_travel = travel_time
            closest_facility = facility["facilityId"]
    
    if home_travel == float('inf'):
        home_travel = 0.0
    
    if closest_facility:
        details.append(f"Home → {closest_facility}: {home_travel:.2f}h")
    
    # Step 2: Calculate optimal facility-to-facility travel
    facility_travel = 0.0
    
    if len(facilities) > 1:
        # For multiple facilities, find optimal routing
        # Start from the closest facility (already visited from home)
        remaining_facilities = [f for f in facilities if f["facilityId"] != closest_facility]
        current_facility = closest_facility
        
        # Greedy nearest neighbor approach for facility routing
        while remaining_facilities:
            nearest_distance = float('inf')
            nearest_facility_index = -1
            
            for i, facility in enumerate(remaining_facilities):
                travel_time = get_travel_time(facility_facility_df, current_facility, facility["facilityId"])
                if travel_time < nearest_distance:
                    nearest_distance = travel_time
                    nearest_facility_index = i
            
            if nearest_facility_index >= 0:
                next_facility = remaining_facilities[nearest_facility_index]
                facility_travel += nearest_distance
                details.append(f"{current_facility} → {next_facility['facilityId']}: {nearest_distance:.2f}h")
                
                current_facility = next_facility["facilityId"]
                remaining_facilities.pop(nearest_facility_index)
            else:
                break
    
    total_travel = home_travel + facility_travel
    
    return {
        "homeTravel": round(home_travel, 2),
        "facilityTravel": round(facility_travel, 2),
        "totalTravel": round(total_travel, 2),
        "details": details
    }


def calculate_optimal_travel_statistics(provider_id: str, daily_visits: Dict[str, List[Dict]], 
                                        pcp_facility_df: pd.DataFrame, 
                                        facility_facility_df: pd.DataFrame) -> Dict[str, Any]:
    """
    Calculate optimal travel statistics for a provider across multiple days.
    Aggregates daily optimal travel calculations.
    
    Args:
        provider_id: Provider ID
        daily_visits: Daily visits dict: {date: [{"facilityId": str, "totalVisits": int}, ...], ...}
        pcp_facility_df: PCP-to-facility distance matrix
        facility_facility_df: Facility-to-facility distance matrix
    
    Returns:
        Dict with aggregated travel statistics
    """
    total_home_to_facility = 0.0
    total_facility_to_facility = 0.0
    days_with_travel = 0
    daily_breakdown = {}
    
    for date, facilities in daily_visits.items():
        if not facilities:
            continue
        
        day_result = calculate_optimal_daily_travel(
            provider_id, facilities, pcp_facility_df, facility_facility_df
        )
        
        if day_result["totalTravel"] > 0:
            days_with_travel += 1
            total_home_to_facility += day_result["homeTravel"]
            total_facility_to_facility += day_result["facilityTravel"]
            
            daily_breakdown[date] = {
                "homeTravel": day_result["homeTravel"],
                "facilityTravel": day_result["facilityTravel"],
                "totalTravel": day_result["totalTravel"],
                "details": day_result["details"]
            }
    
    total_travel_time = total_home_to_facility + total_facility_to_facility
    avg_travel_per_day = total_travel_time / days_with_travel if days_with_travel > 0 else 0.0
    
    return {
        "totalTravelTime": round(total_travel_time, 2),
        "avgTravelPerDay": round(avg_travel_per_day, 2),
        "homeToFacilityTravel": round(total_home_to_facility, 2),
        "facilityToFacilityTravel": round(total_facility_to_facility, 2),
        "daysWithTravel": days_with_travel,
        "dailyBreakdown": daily_breakdown
    }


def get_travel_time(matrix: pd.DataFrame, from_id: str, to_id: str) -> float:
    """
    Helper function to get travel time from distance matrix.
    Handles missing data gracefully.
    
    Args:
        matrix: Distance matrix (DataFrame)
        from_id: From location ID
        to_id: To location ID
    
    Returns:
        Travel time in hours (float)
    """
    if matrix is None or from_id not in matrix.index or to_id not in matrix.columns:
        return 0.0
    
    travel_time = matrix.loc[from_id, to_id]
    
    if pd.isna(travel_time):
        return 0.0
    
    try:
        return float(travel_time)
    except (ValueError, TypeError):
        return 0.0


def load_distance_matrices(business_line: str) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Load distance matrices for travel time calculations.
    Same function as in calculate_travel_time.py for compatibility.
    
    Args:
        business_line: Business line name (e.g., "Wisconsin Geriatrics")
    
    Returns:
        Tuple of (pcp_facility_df, facility_facility_df)
    """
    try:
        business_line_clean = business_line.replace(" ", "_")
        
        # Load PCP-Facility distances
        pcp_facility_path = f"data/anonymized/distance_matrices/{business_line_clean}_pcp_facility_durations.csv"
        pcp_facility_df = pd.read_csv(pcp_facility_path, index_col=0)
        
        # Load Facility-Facility distances
        facility_facility_path = f"data/anonymized/distance_matrices/{business_line_clean}_facility_facility_durations.csv"
        facility_facility_df = pd.read_csv(facility_facility_path, index_col=0)
        
        return pcp_facility_df, facility_facility_df
        
    except Exception as e:
        print(f"ERROR: Failed to load distance matrices: {e}")
        return None, None


def group_visits_by_date(visits_df: pd.DataFrame) -> Dict[str, List[Dict]]:
    """
    Group visit data by date for travel calculation.
    
    Args:
        visits_df: DataFrame with visit data including 'Service Date' and facility info
    
    Returns:
        Dict mapping date strings to lists of facility visits
    """
    daily_visits = {}
    
    for _, visit in visits_df.iterrows():
        date = visit['Service Date'].strftime('%Y-%m-%d')
        facility_id = visit['Service Site UiD']
        total_visits = visit['Total Visits']
        
        if date not in daily_visits:
            daily_visits[date] = []
        
        daily_visits[date].append({
            "facilityId": facility_id,
            "totalVisits": total_visits
        })
    
    return daily_visits


if __name__ == "__main__":
    # Example usage - can be run as standalone script for testing
    print("Optimal Travel Calculator - Python Implementation")
    print("This module provides unified travel calculation functions.")
    print("Import functions to use in other scripts or run calculate_travel_time_optimal.py")