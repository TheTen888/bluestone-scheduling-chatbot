#!/usr/bin/env python3
"""
Healthcare Provider Scheduling Backend API

This Flask application provides endpoints for:
1. Loading and processing real healthcare scheduling data
2. Computing distance matrices between providers and facilities  
3. Running optimization models to generate optimal schedules
4. Returning results in JSON format for frontend visualization

The backend now uses real Wisconsin Geriatrics data with dynamic configuration.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import sys
import os
import pandas as pd
from pathlib import Path
import json

# Add the models directory to Python path for imports
current_dir = Path(__file__).parent
models_dir = current_dir / 'models'

def calculate_provider_count(schedule_data):
    """Calculate provider count from schedule data."""
    optimization_mode = schedule_data.get('optimization_mode', 'unknown')
    if optimization_mode == 'single_provider':
        return 1
    else:
        return len(schedule_data.get('schedule', {}).keys())

def calculate_facility_count(schedule_data):
    """Calculate facility count from schedule data."""
    optimization_mode = schedule_data.get('optimization_mode', 'unknown')
    if optimization_mode == 'single_provider':
        return schedule_data.get('facilities_served', 0)
    else:
        # Count unique facilities across all providers
        all_facilities = set()
        schedule = schedule_data.get('schedule', {})
        for provider_schedule in schedule.values():
            for day_schedule in provider_schedule.values():
                all_facilities.update(day_schedule.keys())
        return len(all_facilities)
sys.path.append(str(models_dir))

from models.config import load_config
from models.dataloader import (
    load_pcp_facility_data, 
    load_distance_matrices,
    load_provider_unavailable_dates,
    convert_single_provider_results_to_real_ids
)
from models.ortools_travel_optimized_model import create_and_solve_optimization_model
from utils.quick_optimize_ortools import extract_patient_data_for_provider
from utils.business_line_optimize_ortools import extract_patient_data_for_business_line, combine_provider_results

app = Flask(__name__)
CORS(app)  # Enable CORS for all domains on all routes

# Load dynamic configuration
config = load_config()

def load_distance_matrices_for_business_line(business_line):
    """Load distance matrices for travel time optimization."""
    try:
        business_line_clean = business_line.replace(" ", "_")
        
        # Load PCP-Facility distances
        pcp_facility_path = f"data/anonymized/distance_matrices/Anonymized_{business_line_clean}_pcp_facility_durations.csv"
        pcp_facility_df = pd.read_csv(pcp_facility_path)
        
        # Load Facility-Facility distances  
        facility_facility_path = f"data/anonymized/distance_matrices/Anonymized_{business_line_clean}_facility_facility_durations.csv"
        facility_facility_df = pd.read_csv(facility_facility_path)
        
        # Convert to matrices (assuming first column is index)
        pcp_facility_matrix = pcp_facility_df.iloc[:, 1:].values
        facility_facility_matrix = facility_facility_df.iloc[:, 1:].values
        
        print(f"Loaded distance matrices for {business_line}:")
        print(f"  PCP-Facility: {pcp_facility_matrix.shape}")
        print(f"  Facility-Facility: {facility_facility_matrix.shape}")
        
        return {
            'pcp_facility': pcp_facility_matrix,
            'facility_facility': facility_facility_matrix,
            'source': 'real_distance_data'
        }
        
    except Exception as e:
        print(f"WARNING: Failed to load distance matrices for {business_line}: {e}")
        return None


@app.route('/api/data_parameters', methods=['GET'])
def get_data_parameters():
    """
    Get data parameters based on business line and census month selection.
    Returns real data dimensions from the CSV files with Wisconsin filtering applied.
    """
    try:
        business_line = request.args.get('business_line', 'Wisconsin Geriatrics')
        census_month = request.args.get('census_month', '2024-01')
        
        pcp_data = load_pcp_facility_data(
            csv_path="data/anonymized/PCP_Facility.csv",
            business_line=business_line
        )
        
        provider_count = len(pcp_data['unique_providers']) if pcp_data else 0
        facility_count = len(pcp_data['unique_facilities']) if pcp_data else 0
        
        current_config = load_config()
        
        # Get census data for the specific business line and month
        census_df = pd.read_csv(current_config["CENSUS_FILE"])
        filtered_census = census_df[census_df['Business Line'] == business_line]
        
        # Calculate patient count for the selected month
        total_patients = 0
        facilities_with_data = len(filtered_census)
        
        if census_month in filtered_census.columns:
            total_patients = int(filtered_census[census_month].sum())
            num_facilities = len(filtered_census)
            avg_patients_per_facility = int(total_patients / num_facilities) if num_facilities > 0 else 0
        else:
            # Fallback to average across all months
            month_columns = [col for col in filtered_census.columns if col.startswith('2024-')]
            if month_columns:
                monthly_totals = filtered_census[month_columns].sum(axis=0)
                avg_monthly_total = float(monthly_totals.mean())
                num_facilities = len(filtered_census)
                avg_patients_per_facility = int(avg_monthly_total / num_facilities) if num_facilities > 0 else 0
            else:
                avg_patients_per_facility = 18  # Default for Wisconsin
        
        parameters = {
            'provider_count': int(provider_count),
            'facility_count': int(facility_count), 
            'avg_patients_per_month': int(avg_patients_per_facility),
            'business_line': business_line,
            'census_month': census_month,
            'total_patients_selected_month': int(total_patients),
            'facilities_with_data': int(facilities_with_data)
        }
        
        return jsonify(parameters)
        
    except Exception as e:
        print(f"Error getting data parameters: {e}")
        # Return fallback values
        return jsonify({
            'provider_count': 19,  # Wisconsin filtered count
            'facility_count': 154,  # Wisconsin filtered count
            'avg_patients_per_month': 18,
            'business_line': business_line,
            'census_month': census_month,
            'total_patients_selected_month': 0,
            'facilities_with_data': 0,
            'error': str(e)
        })

@app.route('/api/business_lines', methods=['GET'])
def get_business_lines():
    """Get available business lines from census data."""
    try:
        census_df = pd.read_csv(config["CENSUS_FILE"])
        business_lines = census_df['Business Line'].dropna().unique().tolist()
        # Filter out '_n/a' values
        business_lines = [bl for bl in business_lines if bl != '_n/a']
        return jsonify(business_lines)
    except Exception as e:
        print(f"Error getting business lines: {e}")
        return jsonify(['Wisconsin Geriatrics'])  # Fallback

@app.route('/api/census_months', methods=['GET'])
def get_census_months():
    """Get available census months from the data."""
    try:
        census_df = pd.read_csv(config["CENSUS_FILE"])
        month_columns = [col for col in census_df.columns if col.startswith('2024-')]
        return jsonify(month_columns)
    except Exception as e:
        print(f"Error getting census months: {e}")
        return jsonify(['2024-01', '2024-02', '2024-03', '2024-04', 
                       '2024-05', '2024-06', '2024-07', '2024-08',
                       '2024-09', '2024-10', '2024-11', '2024-12'])  # Fallback

@app.route('/api/providers', methods=['GET'])
def get_providers():
    """Get available providers for a specific business line."""
    try:
        business_line = request.args.get('business_line', 'Wisconsin Geriatrics')
        print(f"Loading providers for business line: {business_line}")
        
        pcp_data = load_pcp_facility_data(
            csv_path="data/anonymized/PCP_Facility.csv",
            business_line=business_line
        )
        
        print(f"PCP data loaded: {bool(pcp_data)}")
        if pcp_data:
            print(f"PCP data keys: {list(pcp_data.keys())}")
            if 'unique_providers' in pcp_data:
                print(f"Found {len(pcp_data['unique_providers'])} providers")
        
        if pcp_data and 'unique_providers' in pcp_data and len(pcp_data['unique_providers']) > 0:
            providers = sorted(pcp_data['unique_providers'])
            print(f"Returning providers: {providers[:5]}...")  # First 5 for debugging
            return jsonify({
                'providers': providers,
                'total_providers': len(providers),
                'business_line': business_line
            })
        else:
            error_msg = f'No providers found for business line: {business_line}'
            if pcp_data:
                error_msg += f' (PCP data loaded but {len(pcp_data.get("unique_providers", []))} providers found)'
            else:
                error_msg += ' (Failed to load PCP data)'
            print(f"ERROR: {error_msg}")
            return jsonify({
                'providers': [],
                'total_providers': 0,
                'business_line': business_line,
                'error': error_msg
            })
            
    except Exception as e:
        print(f"ERROR getting providers: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'providers': [],
            'total_providers': 0,
            'business_line': business_line if 'business_line' in locals() else 'Wisconsin Geriatrics',
            'error': str(e)
        })

@app.route('/api/load_dataset', methods=['POST'])
def load_dataset():
    """
    Load real healthcare dataset based on selected parameters.
    Returns data preview and validation status.
    """
    try:
        data = request.get_json()
        business_line = data.get('business_line', 'Wisconsin Geriatrics')
        census_month = data.get('census_month', '2024-01')
        
        current_config = load_config()
        
        result = {
            'success': True,
            'data_type': 'real',
            'business_line': business_line,
            'census_month': census_month,
            'config': {
                'providers': current_config["P"],
                'facilities': current_config["F"],
                'avg_patients_per_facility': current_config["N_F"]
            }
        }
        
        # Validate data files exist
        data_files = {
            'pcp_facility_matrix': current_config["PCP_FACILITY_MATRIX"],
            'facility_facility_matrix': current_config["FACILITY_FACILITY_MATRIX"],
            'census_data': current_config["CENSUS_FILE"],
            'visits_data': current_config["VISITS_FILE"]
        }
        
        file_status = {}
        for file_type, file_path in data_files.items():
            if os.path.exists(file_path):
                file_status[file_type] = 'found'
            else:
                file_status[file_type] = 'missing'
                result['success'] = False
        
        result['file_status'] = file_status
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Error loading dataset: {e}")
        return jsonify({
            'success': False, 
            'error': str(e),
            'data_type': 'real',
            'business_line': business_line if 'business_line' in locals() else 'Wisconsin Geriatrics',
            'census_month': census_month if 'census_month' in locals() else '2024-01'
        })

@app.route('/api/run_optimization', methods=['POST'])
def run_optimization_endpoint():
    """
    Run the healthcare provider scheduling optimization.
    Uses real data dimensions and constraints.
    Supports both full business line and single provider optimization.
    """
    try:
        request_data = request.get_json()
        
        # Get parameters from request (handle both naming conventions)
        business_line = request_data.get('business_line') or request_data.get('BUSINESS_LINE', 'Wisconsin Geriatrics')
        census_month = request_data.get('census_month') or request_data.get('CENSUS_MONTH', '2024-01')
        optimization_mode = request_data.get('optimization_mode', 'full_business_line')  # 'full_business_line' or 'single_provider'
        selected_provider = request_data.get('selected_provider', None)  # Provider ID like "P51"
        max_patients_per_day = int(request_data.get('max_patients_per_day', 15))  # Default to 15
        
        # New facility visit gap constraint parameters
        lambda_param = float(request_data.get('lambda_param', 0))  # Workload balancing weight
        lambda_facility = float(request_data.get('lambda_facility', 0.1))  # Facility visit gap penalty weight
        alpha = float(request_data.get('alpha', 0.05))  # Service level buffer (5% default)
        facility_visit_window = int(request_data.get('facility_visit_window', 10))  # Facility visit gap window (working days)
        
        # Use current dynamic config with the business line parameter
        current_config = load_config(business_line=business_line)
        
        # Update config with request parameters
        optimization_config = current_config.copy()
        optimization_config.update({
            'BUSINESS_LINE': business_line,
            'CENSUS_MONTH': census_month,
            'max_patients_per_day': max_patients_per_day
        })
        
        print(f"Starting {optimization_mode} optimization for {business_line} ({census_month})")
        if optimization_mode == 'single_provider':
            print(f"Selected provider: {selected_provider}")
        
        # Handle single provider optimization
        if optimization_mode == 'single_provider' and selected_provider:
            
            # Load business line data and find provider index
            pcp_data = load_pcp_facility_data(
                csv_path="data/anonymized/PCP_Facility.csv",
                business_line=business_line
            )
            provider_index = pcp_data['provider_mappings'][selected_provider]

            # Extract patient data for selected provider
            patient_data = extract_patient_data_for_provider(pcp_data, census_month, selected_provider)
            
            # Load distance matrices for travel optimization
            distance_data = load_distance_matrices(business_line)
            
            # Load provider unavailable dates
            unavailable_dates = load_provider_unavailable_dates("data/provider_unavailable_dates.csv", pcp_data)
            
            # Run single provider optimization
            results = create_and_solve_optimization_model(
                providers=len(pcp_data['provider_mappings']),
                facilities=len(pcp_data['facility_mappings']),
                business_line=business_line,
                census_month=census_month,
                target_provider=provider_index,
                pcp_facility_data=pcp_data,
                patient_data=patient_data,
                distance_data=distance_data,
                max_patients_per_day=max_patients_per_day,
                lambda_param=lambda_param,
                lambda_facility=lambda_facility,
                alpha=alpha,
                facility_visit_window=facility_visit_window,
                provider_unavailable_dates=unavailable_dates
            )
            
            # Convert indexed IDs to real provider/facility IDs
            converted_results = convert_single_provider_results_to_real_ids(results, pcp_data, selected_provider)
            
            # Get actual provider demand from patient data
            provider_demand = patient_data.get('provider_demand', 0) if patient_data else 0
            facilities_served = len(patient_data.get('provider_facilities', [])) if patient_data else 0
            
            formatted_results = {
                'optimization_mode': 'single_provider',
                'selected_provider': selected_provider,
                'provider_index': provider_index,
                'facilities_served': facilities_served,
                'status': converted_results.get('status'),
                'schedule': converted_results.get('schedule', {}),
                'provider_utilization': converted_results.get('provider_utilization', {}),
                'total_patients_served': converted_results.get('total_patients_served', 0),
                'total_patient_demand': provider_demand,  # Use provider-specific demand, not system-wide
                'summary_stats': converted_results.get('summary_stats', {}),
                'total_travel_time': converted_results.get('total_travel_time', 0),
                'home_to_facility_travel': converted_results.get('home_to_facility_travel', 0),
                'facility_to_facility_travel': converted_results.get('facility_to_facility_travel', 0),
                'daily_travel_times': converted_results.get('daily_travel_times', {}),
                'objective_value': converted_results.get('objective_value', 0),
                'overall_utilization': converted_results.get('overall_utilization', 0),
                'metadata': converted_results.get('metadata', {})
            }
            
            return jsonify({
                'success': True,
                'results': formatted_results,
                'config_used': {
                    'business_line': business_line,
                    'census_month': census_month,
                    'optimization_mode': optimization_mode,
                    'selected_provider': selected_provider,
                    'max_patients_per_day': max_patients_per_day,
                    'lambda_param': lambda_param,
                    'lambda_facility': lambda_facility,
                    'alpha': alpha,
                    'facility_visit_window': facility_visit_window,
                    'providers': len(pcp_data['provider_mappings']),
                    'facilities': len(pcp_data['facility_mappings'])
                }
            })
        
        else:
            # Run full business line optimization
            
            # Load business line data
            pcp_data = load_pcp_facility_data(
                csv_path="data/anonymized/PCP_Facility.csv",
                business_line=business_line
            )
            
            if not pcp_data:
                raise ValueError(f"No data found for {business_line}")
            
            # Extract patient data for all providers
            patient_data = extract_patient_data_for_business_line(pcp_data, census_month)
            
            if not patient_data:
                raise ValueError(f"No patient data found for {business_line} in {census_month}")
            
            # Load distance matrices
            distance_data = load_distance_matrices(business_line)
            
            # Load provider unavailable dates
            unavailable_dates = load_provider_unavailable_dates("data/provider_unavailable_dates.csv", pcp_data)
            
            # Run sequential optimization for each provider
            provider_results = []
            successful_optimizations = 0
            failed_optimizations = 0
            
            print(f"Starting sequential optimization for {len(pcp_data['unique_providers'])} providers...")
            
            for provider_id in sorted(pcp_data['unique_providers']):
                print(f"\n{'='*60}")
                print(f"🔄 OPTIMIZING PROVIDER {provider_id}")
                print(f"{'='*60}")
                
                try:
                    # Get provider index
                    provider_index = pcp_data['provider_mappings'][provider_id]
                    
                    # Extract patient data for this specific provider
                    provider_patient_data = extract_patient_data_for_provider(pcp_data, census_month, provider_id)
                    
                    if not provider_patient_data:
                        print(f"  No patient data for {provider_id}, skipping...")
                        failed_optimizations += 1
                        continue
                    
                    # Run individual provider optimization
                    provider_result = create_and_solve_optimization_model(
                        providers=len(pcp_data['provider_mappings']),
                        facilities=len(pcp_data['facility_mappings']),
                        business_line=business_line,
                        census_month=census_month,
                        target_provider=provider_index,  # Single provider mode
                        pcp_facility_data=pcp_data,
                        patient_data=provider_patient_data,
                        distance_data=distance_data,
                        max_patients_per_day=max_patients_per_day,
                        lambda_param=lambda_param,
                        lambda_facility=lambda_facility,
                        alpha=alpha,
                        facility_visit_window=facility_visit_window,
                        provider_unavailable_dates=unavailable_dates
                    )
                    
                    if provider_result.get('status') in ['Optimal', 'Feasible (Time Limit)']:
                        # Add provider ID to results for tracking
                        provider_result['provider_id'] = provider_id
                        provider_result['provider_index'] = provider_index
                        provider_results.append(provider_result)
                        successful_optimizations += 1
                        
                        # Show summary with travel time breakdown
                        patients_served = provider_result.get('total_patients_served', 0)
                        travel_time = provider_result.get('total_travel_time', 0)
                        home_travel = provider_result.get('home_to_facility_travel', 0)
                        facility_travel = provider_result.get('facility_to_facility_travel', 0)
                        objective_value = provider_result.get('objective_value', 0)
                        
                        print(f"✅ COMPLETED {provider_id}: {patients_served} patients, {travel_time:.2f}h travel, objective: {objective_value:.2f}")
                        print(f"   Travel breakdown: Home-Facility={home_travel:.2f}h, Facility-Facility={facility_travel:.2f}h")
                        print(f"{'='*60}")
                    else:
                        print(f"❌ FAILED {provider_id}: Optimization failed - {provider_result.get('message', 'Unknown error')}")
                        print(f"{'='*60}")
                        failed_optimizations += 1
                        
                except Exception as e:
                    print(f"❌ ERROR {provider_id}: {str(e)}")
                    print(f"{'='*60}")
                    failed_optimizations += 1
            
            print(f"Sequential optimization completed: {successful_optimizations} successful, {failed_optimizations} failed")
            
            if not provider_results:
                raise ValueError("All provider optimizations failed")
            
            # Combine individual provider results
            results = combine_provider_results(provider_results, pcp_data)
            
            formatted_results = {
                'optimization_mode': 'full_business_line_sequential',
                'status': results.get('status'),
                'schedule': results.get('schedule', {}),
                'provider_utilization': results.get('provider_utilization', {}),
                'total_patients_served': results.get('total_patients_served', 0),
                'total_patient_demand': results.get('total_patient_demand', 0),
                'summary_stats': results.get('summary_stats', {}),
                'total_travel_time': results.get('total_travel_time', 0),
                'home_to_facility_travel': results.get('home_to_facility_travel', 0),
                'facility_to_facility_travel': results.get('facility_to_facility_travel', 0),
                'daily_travel_times': results.get('daily_travel_times', {}),
                'objective_value': results.get('objective_value', 0),
                'overall_utilization': results.get('overall_utilization', 0),
                'metadata': results.get('metadata', {}),
                'provider_results_summary': results.get('provider_results_summary', []),
                'optimization_summary': {
                    'successful_optimizations': successful_optimizations,
                    'failed_optimizations': failed_optimizations,
                    'total_providers': len(pcp_data['unique_providers'])
                }
            }
            
            return jsonify({
                'success': True,
                'results': formatted_results,
                'config_used': {
                    'business_line': business_line,
                    'census_month': census_month,
                    'optimization_mode': optimization_mode,
                    'max_patients_per_day': max_patients_per_day,
                    'lambda_param': lambda_param,
                    'lambda_facility': lambda_facility,
                    'alpha': alpha,
                    'facility_visit_window': facility_visit_window,
                    'providers': len(pcp_data['provider_mappings']),
                    'facilities': len(pcp_data['facility_mappings'])
                }
            })
        
    except Exception as e:
        print(f"Error in optimization: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

@app.route('/api/saved_schedules', methods=['GET'])
def get_saved_schedules():
    """Get list of saved schedule files with metadata for browsing."""
    try:
        schedules_dir = Path("results/schedules")
        if not schedules_dir.exists():
            return jsonify({'schedules': []})
        
        schedules = []
        for file in schedules_dir.glob("*.json"):
            try:
                with open(file, 'r') as f:
                    schedule_data = json.load(f)
                
                metadata = schedule_data.get('metadata', {})
                file_info = {
                    'filename': file.name,
                    'display_name': metadata.get('user_name', file.stem.replace('_', ' ').title()),
                    'size': file.stat().st_size,
                    'modified': file.stat().st_mtime,
                    'metadata': {
                        'business_line': metadata.get('business_line', 'Unknown'),
                        'census_month': metadata.get('census_month', 'Unknown'),
                        'optimization_mode': metadata.get('optimization_mode', 'Unknown'),
                        'max_patients_per_day': metadata.get('max_patients_per_day', 'Unknown'),
                        'total_patients_served': metadata.get('total_patients_served', 0),
                        'total_travel_time': metadata.get('total_travel_time', 0),
                        'overall_utilization': metadata.get('overall_utilization', 0),
                        'saved_at': metadata.get('saved_at', ''),
                        'providers': calculate_provider_count(schedule_data),
                        'facilities': calculate_facility_count(schedule_data)
                    }
                }
                schedules.append(file_info)
                
            except Exception as e:
                print(f"Error reading schedule file {file}: {e}")
                schedules.append({
                    'filename': file.name,
                    'display_name': file.stem.replace('_', ' ').title(),
                    'size': file.stat().st_size,
                    'modified': file.stat().st_mtime,
                    'metadata': {'error': 'Could not read metadata'}
                })
        
        schedules.sort(key=lambda x: x['modified'], reverse=True)
        
        return jsonify({'schedules': schedules})
        
    except Exception as e:
        print(f"Error getting saved schedules: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/load_schedule/<filename>', methods=['GET'])
def load_schedule(filename):
    """Load a saved schedule by filename."""
    try:
        schedules_dir = Path("results/schedules")
        schedule_file = schedules_dir / filename
        
        if not schedule_file.exists():
            return jsonify({'error': 'Schedule file not found'}), 404
        
        with open(schedule_file, 'r') as f:
            schedule_data = json.load(f)
        
        return jsonify({
            'success': True,
            'filename': filename,
            'data': schedule_data
        })
        
    except Exception as e:
        print(f"Error loading schedule {filename}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/save_schedule', methods=['POST'])
def save_schedule():
    """Save current schedule results to file with metadata."""
    try:
        request_data = request.get_json()
        schedule_data = request_data.get('schedule_data')
        user_name = request_data.get('name', '')
        original_config = request_data.get('config', {})
        
        if not schedule_data:
            return jsonify({'error': 'No schedule data provided'}), 400
        
        if not user_name:
            return jsonify({'error': 'Schedule name is required'}), 400
        
        schedules_dir = Path("results/schedules")
        schedules_dir.mkdir(parents=True, exist_ok=True)
        
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_name = "".join(c for c in user_name if c.isalnum() or c in (' ', '-', '_')).rstrip()
        filename = f"{safe_name.replace(' ', '_')}_{timestamp}.json"
        
        schedule_file = schedules_dir / filename
        
        # Enhance schedule data with metadata for browsing
        enhanced_data = schedule_data.copy()
        enhanced_data['metadata'] = {
            'user_name': user_name,
            'business_line': original_config.get('BUSINESS_LINE', original_config.get('business_line', 'Unknown')),
            'census_month': original_config.get('CENSUS_MONTH', original_config.get('census_month', 'Unknown')),
            'optimization_mode': original_config.get('optimization_mode', 'Unknown'),
            'max_patients_per_day': original_config.get('max_patients_per_day', 'Unknown'),
            'lambda_param': original_config.get('lambda_param', 0),
            'lambda_facility': original_config.get('lambda_facility', 0),
            'alpha': original_config.get('alpha', 0),
            'facility_visit_window': original_config.get('facility_visit_window', 0),
            'selected_provider': original_config.get('selected_provider'),
            'total_patients_served': schedule_data.get('total_patients_served', 0),
            'total_travel_time': schedule_data.get('total_travel_time', 0),
            'overall_utilization': schedule_data.get('overall_utilization', 0),
            'saved_at': datetime.now().isoformat(),
            'original_config': original_config
        }
        
        # Calculate provider and facility counts based on optimization mode
        optimization_mode = schedule_data.get('optimization_mode', 'unknown')
        
        if optimization_mode == 'single_provider':
            provider_count = 1
            facility_count = schedule_data.get('facilities_served', 0)
        else:
            # For full business line, count from schedule data
            provider_count = len(schedule_data.get('schedule', {}).keys())
            # Count unique facilities across all providers
            all_facilities = set()
            schedule = schedule_data.get('schedule', {})
            for provider_schedule in schedule.values():
                for day_schedule in provider_schedule.values():
                    all_facilities.update(day_schedule.keys())
            facility_count = len(all_facilities)
        
        enhanced_data['metadata']['providers'] = provider_count
        enhanced_data['metadata']['facilities'] = facility_count
        
        # Save enhanced schedule data
        with open(schedule_file, 'w') as f:
            json.dump(enhanced_data, f, indent=2)
        
        return jsonify({
            'success': True,
            'filename': filename,
            'path': str(schedule_file),
            'message': f'Schedule saved as "{user_name}"'
        })
        
    except Exception as e:
        print(f"Error saving schedule: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/delete_schedule/<filename>', methods=['DELETE'])
def delete_schedule(filename):
    """Delete a saved schedule file."""
    try:
        schedules_dir = Path("results/schedules")
        schedule_file = schedules_dir / filename
        
        if not schedule_file.exists():
            return jsonify({'error': 'Schedule file not found'}), 404
        
        schedule_file.unlink()
        
        return jsonify({
            'success': True,
            'message': f'Schedule deleted successfully'
        })
        
    except Exception as e:
        print(f"Error deleting schedule {filename}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'config_loaded': bool(config),
        'data_files_configured': all([
            config.get("PCP_FACILITY_MATRIX"),
            config.get("FACILITY_FACILITY_MATRIX"), 
            config.get("CENSUS_FILE"),
            config.get("VISITS_FILE")
        ])
    })

if __name__ == '__main__':
    print("Starting Healthcare Provider Scheduling Backend...")
    print(f"Loaded configuration with:")
    print(f"- Providers: {config['P']}")
    print(f"- Facilities: {config['F']}")
    print(f"- Avg Patients/Facility: {config['N_F']}")
    print(f"- Data files configured: {bool(config.get('PCP_FACILITY_MATRIX'))}")
    app.run(debug=True, host='0.0.0.0', port=5001)