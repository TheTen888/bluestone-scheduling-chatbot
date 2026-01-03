"""
Travel Time Optimized Model for Healthcare Provider Scheduling - OR-Tools Implementation.

This module provides optimization that minimizes total travel time using real 
Wisconsin Geriatrics distance matrices while satisfying census-based patient demands.
Uses Google OR-Tools with built-in SCIP solver.
"""

from ortools.linear_solver import pywraplp
import pandas as pd
import numpy as np
from typing import Dict, Any, Optional
import calendar
from datetime import datetime, timedelta
import sys
import os

# Add utils directory to path for optimal travel calculator
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'utils'))
from optimal_travel_calculator import calculate_optimal_daily_travel

# Import shared data loading utilities
from models.dataloader import (
    get_travel_time_pcp_to_facility, 
    get_travel_time_facility_to_facility,
    load_pcp_facility_data,
    load_distance_matrices,
    get_working_days_for_month,
    load_provider_unavailable_dates
)

def create_and_solve_optimization_model(
    providers: int,
    facilities: int, 
    weeks: int = 4,
    days_per_week: int = 5,
    max_patients_per_day: int = 20,
    patient_data: Optional[Dict] = None,
    distance_data: Optional[Dict] = None,
    business_line: str = "Wisconsin Geriatrics",
    target_provider: Optional[int] = None,
    pcp_facility_data: Optional[Dict] = None,
    lambda_param: float = 1.0,
    lambda_facility: float = 1.0,
    lambda_bunching: float = 0.0,
    alpha: float = 0.05,
    facility_visit_window: int = 10,
    provider_unavailable_dates: Optional[set] = None,
    required_visits: Optional[set] = None,
    forbidden_visits: Optional[set] = None,
    start_monday: Optional[str] = None,
    weekly_availability: Optional[list] = None
) -> Dict[str, Any]:
    """
    Creates and solves multi-objective optimization model using OR-Tools that balances 
    travel time and workload using real distance data with actual calendar dates.
    
    Args:
        lambda_param: Workload balancing penalty weight (higher = more balanced workloads).
        lambda_facility: Facility visit gap penalty weight (higher = more frequent facility visits).
        alpha: Service level buffer percentage (e.g., 0.05 = 5% buffer for 105% of census).
               Patient requirements will be multiplied by (1 + alpha).
        facility_visit_window: Rolling window size for facility visit gap constraints (working days).
                              Default is 10 working days (~2 weeks).
        provider_unavailable_dates: Set of (provider_idx, date_str) tuples for dates when 
                                   providers are unavailable (e.g., time off requests).
    """
    
    # Decide which working days to use:
    # - If start_monday is provided → 4-week rolling window starting from that date
    if start_monday:
        try:
            start_date = datetime.strptime(start_monday, '%Y-%m-%d').date()
        except ValueError:
            raise ValueError(f"Invalid start_monday format: {start_monday}. Expected YYYY-MM-DD")
        
        # Build a 4-week window (28 calendar days) and keep only Mon–Fri
        working_days = []
        current = start_date
        end_date = start_date + timedelta(days=7 * weeks)  # weeks=4 by default
        while current < end_date:
            # weekday(): 0=Mon, 1=Tue, ..., 4=Fri, 5=Sat, 6=Sun
            if current.weekday() < 5:
                working_days.append(current)
            current += timedelta(days=1)
        
        print(f"\nScheduling for rolling 4-week window starting {start_date.strftime('%Y-%m-%d')}:")
        if working_days:
            print(f"   Working days: {len(working_days)} ({working_days[0].strftime('%m/%d')} to {working_days[-1].strftime('%m/%d')})")
        else:
            print("   WARNING: No working days generated for rolling window!")
    
    total_days = len(working_days)

    
    # Extract valid provider-facility pairs from PCP-Facility data
    valid_pf_pairs = set()
    
    if pcp_facility_data and 'provider_facility_pairs' in pcp_facility_data:
        valid_pf_pairs = set(pcp_facility_data['provider_facility_pairs'])
        
        unique_providers = set(p for p, f in valid_pf_pairs)
        unique_facilities = set(f for p, f in valid_pf_pairs)
        
        if target_provider is None:
            print(f"\nStarting OR-Tools Travel Time Optimized Model")
            print(f"   Business Line: {business_line}")
            print(f"   Valid Provider-Facility Pairs: {len(valid_pf_pairs)}")
            print(f"   Providers in Business Line: {len(unique_providers)}")
            print(f"   Facilities in Business Line: {len(unique_facilities)}")
    else:
        # Fallback: all providers can visit all facilities
        valid_pf_pairs = set((p, f) for p in range(providers) for f in range(facilities))
        print(f"   WARNING: No PCP-Facility data provided - using all combinations")

    # Handle single provider optimization
    if target_provider is not None:
        if target_provider < 0 or target_provider >= providers:
            raise ValueError(f"target_provider {target_provider} must be between 0 and {providers-1}")
        
        active_providers = [target_provider]
        valid_pf_pairs = set((p, f) for p, f in valid_pf_pairs if p == target_provider)
        target_facilities = len(set(f for p, f in valid_pf_pairs))
        print(f"Single provider optimization: {target_facilities} facilities")
    else:
        print(f"   Multi-Provider Mode: Optimizing All {providers} Providers")
        print(f"   Facilities: {facilities}")
        active_providers = list(range(providers))
    
    # Extract real patient requirements from census data
    if not patient_data or 'patient_counts' not in patient_data:
        raise ValueError("Patient data with 'patient_counts' is required for optimization.")
        
    # Apply alpha service level buffer (e.g., alpha=0.05 means 105% of census)
    patient_requirements = [max(0, round(count * (1 + alpha))) for count in patient_data['patient_counts']]
    while len(patient_requirements) < facilities:
        patient_requirements.append(0)
    patient_requirements = patient_requirements[:facilities]
    
    total_real_demand = sum(patient_requirements)
    facilities_with_patients = sum(1 for req in patient_requirements if req > 0)
    
    if target_provider is None:
        print(f"   Real Patient Data:")
        print(f"      Total System Demand: {total_real_demand} patients")
        print(f"      Facilities with Patients: {facilities_with_patients}/{facilities}")
    else:
        print(f"Patient demand: {total_real_demand} patients")

    # Calculate max capacity using actual working days excluding Fridays
    working_days_excluding_fridays = sum(1 for d in working_days if d.weekday() != 4)
    max_capacity = len(active_providers) * working_days_excluding_fridays * max_patients_per_day
    
    # Extract distance matrices for travel time optimization
    if not distance_data or 'pcp_facility_df' not in distance_data or 'facility_facility_df' not in distance_data:
        raise ValueError("Distance data with 'pcp_facility_df' and 'facility_facility_df' is required.")
        
    pcp_facility_df = distance_data.get('pcp_facility_df')
    facility_facility_df = distance_data.get('facility_facility_df')
    print("Travel optimization enabled (using DataFrames)")
    
    # Create reverse mappings from index to ID for lookups
    idx_to_provider = {idx: p_id for p_id, idx in pcp_facility_data['provider_mappings'].items()}
    idx_to_facility = {idx: f_id for f_id, idx in pcp_facility_data['facility_mappings'].items()}

    # ========================================================================
    # BUILD PROVIDER AVAILABILITY MATRIX
    # ========================================================================
    
    # Build availability matrix: A[p,d] = 1 if provider p is available on day d, 0 otherwise
    availability = {}
    
    # Initialize with default availability (all days except Fridays)
    day_mapping = {item['day']: item.get('isWorking', True) for item in weekly_availability}
    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]  # Model only uses 0-4

    for p in active_providers:
        for d in range(total_days):
            day_of_week_name = day_names[working_days[d].weekday()]
            # Check if this day is marked as "isWorking: false"
            if not day_mapping.get(day_of_week_name, True):
                availability[p, d] = 0  # Mark as unavailable
            else:
                availability[p, d] = 1
    
    # Apply unavailable dates from CSV if provided
    unavailable_count = 0
    if provider_unavailable_dates:
        for provider_idx, date_str in provider_unavailable_dates:
            # Find the corresponding day index
            for d in range(total_days):
                if working_days[d].strftime('%Y-%m-%d') == date_str:
                    if provider_idx in active_providers:
                        availability[provider_idx, d] = 0
                        unavailable_count += 1
                        # Show which provider is unavailable on which date
                        provider_id = idx_to_provider.get(provider_idx, f"Provider_{provider_idx}")
                        if target_provider is not None:  # Single provider mode
                            print(f"   {provider_id} unavailable on {date_str}")
                    break
        
        if unavailable_count > 0:
            print(f"   Applied {unavailable_count} additional unavailable date constraints")
    
    # Count total unavailable days for active providers (Fridays + CSV dates)
    total_unavailable_days = sum(1 for p in active_providers for d in range(total_days) if availability[p, d] == 0)
    total_possible_days = len(active_providers) * total_days
    available_days = total_possible_days - total_unavailable_days
    
    if target_provider is not None:
        provider_unavailable = sum(1 for d in range(total_days) if availability[target_provider, d] == 0)
        print(f"   Provider availability: {total_days - provider_unavailable}/{total_days} days available")
    else:
        print(f"   Total provider-days available: {available_days}/{total_possible_days}")

    # ========================================================================
    # CREATE OR-TOOLS MODEL
    # ========================================================================
    
    try:
        # Create the OR-Tools solver instance
        solver = pywraplp.Solver.CreateSolver('SCIP')
        if not solver:
            raise Exception("SCIP solver not available")
        
        print("Running OR-Tools optimization with SCIP solver...")
        
        # Set solver parameters - more conservative approach
        solver.set_time_limit(15 * 1000)  # 15 seconds for quick testing
        solver.SetNumThreads(4)
        
        # ========================================================================
        # DECISION VARIABLES
        # ========================================================================
        
        # Primary decision variables: x[p,f,d] = patients from facility f seen by provider p on day d
        x = {}
        for p in active_providers:
            for f in range(facilities):
                for d in range(total_days):
                    if (p, f) in valid_pf_pairs:
                        x[p, f, d] = solver.IntVar(0, max_patients_per_day, f'x_{p}_{f}_{d}')
                    else:
                        x[p, f, d] = solver.IntVar(0, 0, f'x_{p}_{f}_{d}')  # Force to 0 for invalid pairs
        
        # Binary variables: y[p,d] = 1 if provider p works on day d
        y = {}
        for p in active_providers:
            for d in range(total_days):
                y[p, d] = solver.BoolVar(f'y_{p}_{d}')
        
        # Binary variables for facility visits: z[p,f,d] = 1 if provider p visits facility f on day d
        z = {}
        for p in active_providers:
            for f in range(facilities):
                for d in range(total_days):
                    if (p, f) in valid_pf_pairs:
                        z[p, f, d] = solver.BoolVar(f'z_{p}_{f}_{d}')
                    else:
                        z[p, f, d] = solver.BoolVar(f'z_{p}_{f}_{d}')  # Will be forced to 0 by constraints
        
        # Variable for maximum single day workload across all providers (for workload balancing)
        x_max = solver.NumVar(0, solver.infinity(), 'x_max')
        
        # Home travel variables (matches Gurobi model exactly)
        home_travel_vars = {}
        for p in active_providers:
            for d in range(total_days):
                home_travel_vars[p, d] = solver.NumVar(0, solver.infinity(), f'home_travel_{p}_{d}')
        
        # ========================================================================
        # CONSTRAINTS
        # ========================================================================
        
        # CONSTRAINT 1: Patient coverage requirements with alpha service level buffer
        # Patient requirements already include (1 + alpha) multiplier for service buffer
        
        # Check if we have provider-specific demands (business line mode with preserved assignments)
        provider_facility_demands = patient_data.get('provider_facility_demands', {})
        use_provider_specific = bool(provider_facility_demands and target_provider is None)
        
        if use_provider_specific:
            # Business line mode: Use provider-specific patient requirements
            print("   Using provider-specific patient requirements (preserves assignments)")
            
            # Create reverse mapping from provider index to provider ID
            idx_to_provider_id = {idx: p_id for p_id, idx in pcp_facility_data['provider_mappings'].items()}
            
            # Create provider-specific patient requirements matrix
            provider_facility_requirements = {}
            
            for p in active_providers:
                provider_id = idx_to_provider_id[p]
                for f in range(facilities):
                    if (p, f) in valid_pf_pairs:
                        facility_id = pcp_facility_data['unique_facilities'][f]
                        provider_demand = provider_facility_demands.get((provider_id, facility_id), 0)
                        
                        if provider_demand > 0:
                            # Apply alpha buffer to provider-specific demand
                            required_patients = max(0, round(provider_demand * (1 + alpha)))
                            provider_facility_requirements[(p, f)] = required_patients
                            
                            # Each provider must serve exactly their specific patient count at this facility
                            constraint = solver.Constraint(required_patients, required_patients)
                            for d in range(total_days):
                                constraint.SetCoefficient(x[p, f, d], 1)
                        else:
                            # Provider has no patients at this facility - force to 0
                            provider_facility_requirements[(p, f)] = 0
                            for d in range(total_days):
                                constraint = solver.Constraint(0, 0)
                                constraint.SetCoefficient(x[p, f, d], 1)
        else:
            # Single provider mode or legacy business line mode: Use facility aggregated requirements
            facilities_with_providers = set(f for p, f in valid_pf_pairs if p in active_providers)
            for f in range(facilities):
                if f in facilities_with_providers and patient_requirements[f] > 0:
                    constraint = solver.Constraint(patient_requirements[f], patient_requirements[f])
                    for p in active_providers:
                        for d in range(total_days):
                            if (p, f) in valid_pf_pairs:
                                constraint.SetCoefficient(x[p, f, d], 1)
        
        # CONSTRAINT 2: Provider daily capacity limits
        for p in active_providers:
            for d in range(total_days):
                constraint = solver.Constraint(0, max_patients_per_day)
                for f in range(facilities):
                    if (p, f) in valid_pf_pairs:
                        constraint.SetCoefficient(x[p, f, d], 1)
        
        # CONSTRAINT 3: Link patient assignments to working days
        for p in active_providers:
            for d in range(total_days):
                constraint = solver.Constraint(-solver.infinity(), 0)
                for f in range(facilities):
                    if (p, f) in valid_pf_pairs:
                        constraint.SetCoefficient(x[p, f, d], 1)
                constraint.SetCoefficient(y[p, d], -max_patients_per_day)
        
        # CONSTRAINT 4: Link patient assignments to facility visits
        for p in active_providers:
            for f in range(facilities):
                for d in range(total_days):
                    if (p, f) in valid_pf_pairs:
                        # x[p,f,d] <= max_patients_per_day * z[p,f,d]
                        constraint = solver.Constraint(-solver.infinity(), 0)
                        constraint.SetCoefficient(x[p, f, d], 1)
                        constraint.SetCoefficient(z[p, f, d], -max_patients_per_day)
                    else:
                        # Force invalid pairs to 0
                        constraint1 = solver.Constraint(0, 0)
                        constraint1.SetCoefficient(x[p, f, d], 1)
                        constraint2 = solver.Constraint(0, 0)
                        constraint2.SetCoefficient(z[p, f, d], 1)
        
        # CONSTRAINT 5: Provider availability restrictions (includes no Fridays + unavailable dates)
        # Implements: y[p,d] <= A[p,d] where A[p,d] = 1 if available, 0 if unavailable
        for p in active_providers:
            for d in range(total_days):
                if availability[p, d] == 0:  # Provider unavailable on this day
                    constraint = solver.Constraint(0, 0)
                    constraint.SetCoefficient(y[p, d], 1)
        
        # CONSTRAINT 6: Maximum daily workload constraint (for workload balancing)
        for p in active_providers:
            for d in range(total_days):
                constraint = solver.Constraint(0, solver.infinity())
                constraint.SetCoefficient(x_max, 1)
                for f in range(facilities):
                    if (p, f) in valid_pf_pairs:
                        constraint.SetCoefficient(x[p, f, d], -1)
        
        # CONSTRAINT 7: Home travel constraints (matches Gurobi model exactly)
        # This is the KEY constraint that makes the OR-Tools model authentic
        for p in active_providers:
            for d in range(total_days):
                valid_facilities_for_provider = [f for f in range(facilities) if (p, f) in valid_pf_pairs]
                if valid_facilities_for_provider:
                    # For each facility that could be visited: home_travel_vars[p,d] >= home_time * z[p,f,d]
                    for f in valid_facilities_for_provider:
                        home_time = get_travel_time_pcp_to_facility(p, f, pcp_facility_df, idx_to_provider, idx_to_facility)
                        if home_time > 0:
                            constraint = solver.Constraint(0, solver.infinity())
                            constraint.SetCoefficient(home_travel_vars[p, d], 1)
                            constraint.SetCoefficient(z[p, f, d], -home_time)
                else:
                    # No valid facilities - home travel should be 0
                    constraint = solver.Constraint(0, 0)
                    constraint.SetCoefficient(home_travel_vars[p, d], 1)
        
        # CONSTRAINT 8: Facility Visit Gap Soft Constraints (Sliding Window)
        # Ensure every facility is visited approximately biweekly
        T = facility_visit_window  # penalty window parameter (configurable working days)

        # Create slack variables for facility visit gaps: s[f,t] for facility f and window starting at day t
        s_facility_gap = {}
        for f in range(facilities):
            # Only create variables for facilities that have valid provider assignments
            facilities_with_providers = [f_check for f_check in range(facilities)
                                       if any((p, f_check) in valid_pf_pairs for p in active_providers)]
            if f in facilities_with_providers:
                for t in range(total_days):
                    s_facility_gap[f, t] = solver.NumVar(0, solver.infinity(), f's_facility_gap_{f}_{t}')

        # Add sliding window constraints: sum of visits in 14-day window + slack >= 1
        for f in range(facilities):
            facilities_with_providers = [f_check for f_check in range(facilities)
                                       if any((p, f_check) in valid_pf_pairs for p in active_providers)]
            if f in facilities_with_providers:
                for t in range(total_days):
                    constraint = solver.Constraint(1, solver.infinity())

                    # Add all visits in the 14-day window starting at day t
                    for j in range(T):
                        day_idx = (t + j) % total_days  # wraparound using modulo
                        for p in active_providers:
                            if (p, f) in valid_pf_pairs:
                                constraint.SetCoefficient(z[p, f, day_idx], 1)

                    # Add slack variable for this window
                    constraint.SetCoefficient(s_facility_gap[f, t], 1)
        # --- NEW: CONSTRAINT 10: Facility Visit "Bunching" Soft Constraint ---

        T_bunching = 7  # Penalize visiting more than once in a 5-day window (approx 1 week)

        s_facility_bunching = {}
        for f in range(facilities):
            facilities_with_providers = [f_check for f_check in range(facilities)
                                         if any((p, f_check) in valid_pf_pairs for p in active_providers)]
            if f in facilities_with_providers:  # We can reuse facilities_with_providers
                for t in range(total_days):
                    s_facility_bunching[f, t] = solver.NumVar(0, solver.infinity(),f's_facility_bunching_{f}_{t}')

        # Add sliding window constraints: sum of visits in 5-day window - slack <= 1
        for f in range(facilities):
            facilities_with_providers = [f_check for f_check in range(facilities)
                                         if any((p, f_check) in valid_pf_pairs for p in active_providers)]
            if f in facilities_with_providers:
                for t in range(total_days):
                    constraint = solver.Constraint(-solver.infinity(), 1)

                    # Add all visits in the 5-day window
                    for j in range(T_bunching):
                        day_idx = (t + j) % total_days
                        for p in active_providers:
                            if (p, f) in valid_pf_pairs:
                                constraint.SetCoefficient(z[p, f, day_idx], 1)
                    constraint.SetCoefficient(s_facility_bunching[f, t], -1)

        # CONSTRAINT 9: Required facility visits (from user input)
        if required_visits:
            print(f"   Applying {len(required_visits)} required visit constraints...")
            print("required_visits: " + str(required_visits))
            for p, f, d in required_visits:
                if p in active_providers and (p, f) in valid_pf_pairs and d < total_days:
                            # Force z[p, f, d] = 1 (must visit)
                            # constraint = solver.Constraint(1, 1)
                            # constraint.SetCoefficient(z[p, f, d], 1)
                    constraint = solver.Constraint(1, max_patients_per_day)
                    constraint.SetCoefficient(x[p, f, d], 1)
                else:
                    print(f"WARNING: Cannot apply required visit for (P{p}, F{f}, D{d}) - invalid parameters.")

        if forbidden_visits:
            print(f"   Applying {len(forbidden_visits)} forbidden visit restrictions...")
            for p, f, d in forbidden_visits:
                if p in active_providers and (p, f) in valid_pf_pairs and d < total_days:
                    constraint = solver.Constraint(0, 0)
                    constraint.SetCoefficient(z[p, f, d], 1)

        # ========================================================================
        # OBJECTIVE FUNCTION
        # ========================================================================
        
        # Calculate T_bar (average travel time per patient) for proper scaling
        total_demand = sum(patient_requirements)
        if total_demand > 0:
            estimated_travel_per_patient = 0.025  # 0.025 hours per patient (1.5 minutes)
            T_bar = estimated_travel_per_patient
        else:
            T_bar = 0.01  # Fallback value
        
        # Create objective - matches Gurobi model exactly
        objective = solver.Objective()
        
        # Term 1: Home travel variables (KEY component for authenticity)
        for p in active_providers:
            for d in range(total_days):
                objective.SetCoefficient(home_travel_vars[p, d], 1)
        
        # Term 2: Facility-to-facility travel (linearized version of Gurobi's quadratic term)
        # Gurobi uses: sum(travel_time(f1,f2) * z[p,f1,d] * z[p,f2,d])
        # We linearize this using auxiliary variables: w[p,f1,f2,d] = z[p,f1,d] * z[p,f2,d]
        
        # Create auxiliary variables for linearization
        w = {}
        for p in active_providers:
            for f1 in range(facilities):
                for f2 in range(facilities):
                    for d in range(total_days):
                        if f1 != f2 and (p, f1) in valid_pf_pairs and (p, f2) in valid_pf_pairs:
                            w[p, f1, f2, d] = solver.BoolVar(f'w_{p}_{f1}_{f2}_{d}')
        
        # Add linearization constraints: w[p,f1,f2,d] = z[p,f1,d] * z[p,f2,d]
        for p in active_providers:
            for f1 in range(facilities):
                for f2 in range(facilities):
                    for d in range(total_days):
                        if f1 != f2 and (p, f1) in valid_pf_pairs and (p, f2) in valid_pf_pairs:
                            # w[p,f1,f2,d] <= z[p,f1,d]
                            constraint1 = solver.Constraint(-solver.infinity(), 0)
                            constraint1.SetCoefficient(w[p, f1, f2, d], 1)
                            constraint1.SetCoefficient(z[p, f1, d], -1)
                            
                            # w[p,f1,f2,d] <= z[p,f2,d]
                            constraint2 = solver.Constraint(-solver.infinity(), 0)
                            constraint2.SetCoefficient(w[p, f1, f2, d], 1)
                            constraint2.SetCoefficient(z[p, f2, d], -1)
                            
                            # w[p,f1,f2,d] >= z[p,f1,d] + z[p,f2,d] - 1
                            constraint3 = solver.Constraint(-1, solver.infinity())
                            constraint3.SetCoefficient(w[p, f1, f2, d], 1)
                            constraint3.SetCoefficient(z[p, f1, d], -1)
                            constraint3.SetCoefficient(z[p, f2, d], -1)
        
        # Add facility-to-facility travel to objective (same as Gurobi)
        facility_facility_df = distance_data.get('facility_facility_df')
        if facility_facility_df is not None:
            for p in active_providers:
                for f1 in range(facilities):
                    for f2 in range(facilities):
                        for d in range(total_days):
                            if f1 != f2 and (p, f1) in valid_pf_pairs and (p, f2) in valid_pf_pairs:
                                travel_time = get_travel_time_facility_to_facility(f1, f2, facility_facility_df, idx_to_facility)
                                if travel_time > 0:
                                    objective.SetCoefficient(w[p, f1, f2, d], travel_time)
        
        # Term 3: Workload balancing penalty
        objective.SetCoefficient(x_max, lambda_param * T_bar)
        
        # Term 4: Facility visit gap penalties (sliding window slack variables)
        for f in range(facilities):
            facilities_with_providers = [f_check for f_check in range(facilities) 
                                       if any((p, f_check) in valid_pf_pairs for p in active_providers)]
            if f in facilities_with_providers:
                for t in range(total_days):
                    if (f, t) in s_facility_gap:
                        objective.SetCoefficient(s_facility_gap[f, t], lambda_facility)

        # --- NEW: Term 5: Facility visit bunching penalties (SLACK FOR BUNCHING) ---
        for f in range(facilities):
            facilities_with_providers = [f_check for f_check in range(facilities)
                                         if any((p, f_check) in valid_pf_pairs for p in active_providers)]
            if f in facilities_with_providers:
                for t in range(total_days):
                    if (f, t) in s_facility_bunching:
                        objective.SetCoefficient(s_facility_bunching[f, t], lambda_bunching)
        
        # Set to minimize
        objective.SetMinimization()
        
        # ========================================================================
        # SOLVE OPTIMIZATION MODEL
        # ========================================================================
        
        print("\nSolving OR-Tools model...")
        status = solver.Solve()
        
        # Display model statistics after optimization
        print(f"\n=== MODEL STATISTICS ===")
        print(f"Variables: {solver.NumVariables():,}")
        print(f"Constraints: {solver.NumConstraints():,}")
        
        # Show total optimization time
        if target_provider is not None:
            print(f"OR-Tools/SCIP total time: {solver.wall_time() / 1000:.3f} seconds")
        
        # Process and return results
        results = {}
        
        # Check if we found a solution (optimal or feasible)
        solution_found = False
        if status == pywraplp.Solver.OPTIMAL:
            results['status'] = 'Optimal'
            solution_found = True
            print("Found optimal solution!")
        elif status == pywraplp.Solver.FEASIBLE:
            results['status'] = 'Feasible (Time Limit)'
            solution_found = True
            print("Found feasible solution (time limit reached)")
        elif status == pywraplp.Solver.INFEASIBLE:
            results['status'] = 'Infeasible'
            results['message'] = 'OR-Tools model is infeasible with current real data constraints'
        elif status == pywraplp.Solver.UNBOUNDED:
            results['status'] = 'Unbounded'
            results['message'] = 'OR-Tools model is unbounded'
        else:
            results['status'] = 'Error'
            results['message'] = f'OR-Tools optimization failed with status: {status}'
        
        if solution_found:
            results['objective_value'] = solver.Objective().Value()
            # Handle very large max_daily_workload values when lambda=0
            max_workload_raw = x_max.solution_value()
            if max_workload_raw > 1000:  # Likely an unbounded value
                # Calculate actual max workload from schedule
                actual_max = 0
                for p in active_providers:
                    for d in range(total_days):
                        day_total = sum(x[p, f, d].solution_value() for f in range(facilities) if (p, f) in valid_pf_pairs)
                        actual_max = max(actual_max, day_total)
                results['max_daily_workload'] = round(actual_max)
            else:
                results['max_daily_workload'] = max_workload_raw
            
            results['lambda_param'] = lambda_param
            results['alpha'] = alpha
            results['T_bar'] = T_bar
            
            # Extract schedule (only for active providers)
            schedule = {f"provider_{p}": {} for p in active_providers}
            provider_utilization = {f"provider_{p}": 0.0 for p in active_providers}
            
            total_patients_served = 0
            total_travel_time = 0
            
            # Calculate travel times from the optimal solution
            daily_travel_times = {}
            total_home_to_facility = 0
            total_facility_to_facility = 0
            
            # Initialize daily travel times for active providers
            for p in active_providers:
                daily_travel_times[f"provider_{p}"] = {}
                for d in range(total_days):
                    date = working_days[d]
                    day_key = date.strftime('%Y-%m-%d')
                    daily_travel_times[f"provider_{p}"][day_key] = 0.0
            
            # Calculate travel times for each provider and day
            for p in active_providers:
                for d in range(total_days):
                    date = working_days[d]
                    day_key = date.strftime('%Y-%m-%d')
                    
                    # Use unified optimal travel calculation for consistency
                    visited_facilities = [f for f in range(facilities) if (p, f) in valid_pf_pairs and z[p, f, d].solution_value() > 0.5]
                    
                    if visited_facilities:
                        # Convert visited facilities to the format expected by optimal calculator
                        provider_id = idx_to_provider.get(p)
                        facilities_list = []
                        for f in visited_facilities:
                            facility_id = idx_to_facility.get(f)
                            # Use a default visit count of 1 for optimization results
                            facilities_list.append({"facilityId": facility_id, "totalVisits": 1})
                        
                        # Use unified optimal travel calculation
                        optimal_result = calculate_optimal_daily_travel(
                            provider_id, facilities_list, pcp_facility_df, facility_facility_df
                        )
                        
                        day_home_to_facility = optimal_result["homeTravel"]
                        day_facility_to_facility = optimal_result["facilityTravel"]
                    else:
                        day_home_to_facility = 0.0
                        day_facility_to_facility = 0.0
                    
                    total_home_to_facility += day_home_to_facility
                    total_facility_to_facility += day_facility_to_facility
                    
                    # Total travel for this day
                    day_travel = day_home_to_facility + day_facility_to_facility
                    daily_travel_times[f"provider_{p}"][day_key] = round(day_travel, 2)
                    total_travel_time += day_travel
            
            # Extract patient assignments
            for p in active_providers:
                provider_total_patients = 0
                for d in range(total_days):
                    day_assignments = {}
                    day_total = 0
                    
                    for f in range(facilities):
                        if (p, f) in valid_pf_pairs:
                            patients = x[p, f, d].solution_value()
                            if patients > 0.1:  # Tolerance for floating point
                                day_assignments[f"facility_{f}"] = round(patients)
                                day_total += patients
                    
                    if day_assignments:
                        date = working_days[d]
                        day_key = date.strftime('%Y-%m-%d')
                        schedule[f"provider_{p}"][day_key] = day_assignments
                        provider_total_patients += day_total
                
                # Calculate provider utilization
                provider_max_capacity = total_days * max_patients_per_day
                utilization = (provider_total_patients / provider_max_capacity) * 100 if provider_max_capacity > 0 else 0
                provider_utilization[f"provider_{p}"] = round(utilization, 1)
                total_patients_served += provider_total_patients
            
            results['schedule'] = schedule
            results['provider_utilization'] = provider_utilization
            results['total_patients_served'] = round(total_patients_served)
            results['total_patient_demand'] = total_real_demand
            results['total_travel_time'] = round(total_travel_time, 2)
            results['home_to_facility_travel'] = round(total_home_to_facility, 2)
            results['facility_to_facility_travel'] = round(total_facility_to_facility, 2)
            results['daily_travel_times'] = daily_travel_times
            
            # Calculate additional summary statistics
            unique_working_days = set()
            total_facilities_visited = set()
            
            for p in active_providers:
                provider_key = f"provider_{p}"
                provider_schedule = schedule.get(provider_key, {})
                
                for day, facilities_dict in provider_schedule.items():
                    if facilities_dict:
                        unique_working_days.add(day)
                        for facility_key, patients in facilities_dict.items():
                            if patients > 0:
                                facility_idx = int(facility_key.split('_')[1])
                                total_facilities_visited.add(facility_idx)
            
            # Calculate averages
            days_worked = len(unique_working_days)
            avg_patients_per_day = round(total_patients_served / days_worked, 1) if days_worked > 0 else 0
            avg_travel_per_day = round(total_travel_time / days_worked, 2) if days_worked > 0 else 0
            
            results['summary_stats'] = {
                'days_worked': days_worked,
                'facilities_visited': len(total_facilities_visited),
                'total_patients_seen': total_patients_served,
                'avg_patients_per_day': avg_patients_per_day,
                'total_travel_time': round(total_travel_time, 2),
                'avg_travel_per_day': avg_travel_per_day
            }
            
            # Calculate overall system utilization
            total_capacity = len(active_providers) * total_days * max_patients_per_day
            results['overall_utilization'] = round((total_patients_served / total_capacity) * 100, 1) if total_capacity > 0 else 0
            
            # Add availability information for single provider mode
            provider_availability_info = {}
            if target_provider is not None:
                unavailable_dates = []
                for d in range(total_days):
                    if availability[target_provider, d] == 0:
                        date_str = working_days[d].strftime('%Y-%m-%d')
                        day_name = working_days[d].strftime('%A')
                        unavailable_dates.append(f"{date_str} ({day_name})")
                
                provider_availability_info = {
                    'total_calendar_days': total_days,
                    'unavailable_days': len(unavailable_dates),
                    'available_days': total_days - len(unavailable_dates),
                    'unavailable_dates_list': unavailable_dates
                }

            # Add metadata
            results['metadata'] = {
                'model_type': 'ortools_travel_optimized_wisconsin_geriatrics_v2',
                'business_line': business_line,
                'start_monday': start_monday,
                'data_source': 'real_census_data' if patient_data else 'fallback_uniform',
                'travel_optimization': pcp_facility_df is not None,
                'distance_matrices_available': pcp_facility_df is not None,
                'facilities_with_patients': facilities_with_patients if patient_data else facilities,
                'optimization_status': results['status'].lower(),
                'single_provider_mode': target_provider is not None,
                'target_provider': target_provider,
                'active_providers': active_providers,
                'total_providers_available': providers,
                'business_line_filtering': bool(pcp_facility_data),
                'valid_provider_facility_pairs': len(valid_pf_pairs),
                'unique_providers_in_business_line': len(set(p for p, f in valid_pf_pairs)),
                'unique_facilities_in_business_line': len(set(f for p, f in valid_pf_pairs)),
                'working_days': total_days,
                'date_range': f"{working_days[0].strftime('%Y-%m-%d')} to {working_days[-1].strftime('%Y-%m-%d')}",
                'provider_availability': provider_availability_info,
                'availability_constraints_applied': bool(provider_unavailable_dates)
            }
            
            if not results['metadata']['single_provider_mode']:
                print(f"   OR-Tools optimization completed successfully!")
                print(f"      Total Patients Served: {results['total_patients_served']}")
                print(f"      Overall Utilization: {results['overall_utilization']}%")
            
        return results
        
    except Exception as e:
        return {
            'status': 'Error',
            'message': f'OR-Tools optimization error: {str(e)}',
            'metadata': {
                'model_type': 'ortools_travel_optimized_wisconsin_geriatrics_v2',
                'business_line': business_line,
                'start_monday': start_monday,
                'error_type': 'general_error'
            }
        }