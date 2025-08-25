"""
Minimal configuration for healthcare provider scheduling.
Only contains parameters actually used by the system.
"""

from pathlib import Path

def _calculate_avg_patients_per_facility(business_line_data, facility_count):
    """Calculate average patients per facility from business line data."""
    month_columns = [col for col in business_line_data.columns if col.startswith('2024-')]
    if month_columns:
        monthly_totals = business_line_data[month_columns].sum(axis=0)
        avg_monthly_total = monthly_totals.mean()
        return int(avg_monthly_total / facility_count) if facility_count > 0 else 15
    return 15

def load_config(business_line=None):
    """
    Load configuration with only essential parameters.
    
    Args:
        business_line (str, optional): Specific business line to load.
    
    Returns:
        dict: Configuration dictionary with essential parameters
    """
    
    # Base paths
    base_dir = Path(__file__).parent.parent
    data_dir = base_dir / "data"
    
    # CONFIGURATION: Change 'anonymized' to 'real' to use your organization's data
    data_source = "anonymized"  # Options: "anonymized" (sample) or "real" (your data)
    source_dir = data_dir / data_source
    
    config = {
        # Data file paths
        "PCP_FACILITY_FILE": str(source_dir / "PCP_Facility.csv"),
        "CENSUS_FILE": str(source_dir / "Census.csv"), 
        "VISITS_FILE": str(source_dir / "PCP_Visits.csv"),
        
        # Available business lines
        "BUSINESS_LINES": ["Wisconsin Geriatrics", "Florida Geriatrics", "Minnesota Geriatrics", "Minnesota ADAPT"],
        "CURRENT_BUSINESS_LINE": business_line,
    }
    
    # Add distance matrix paths if business line specified
    if business_line:
        business_line_clean = business_line.replace(" ", "_")
        pcp_facility_matrix = source_dir / "distance_matrices" / f"{business_line_clean}_pcp_facility_durations.csv"
        facility_facility_matrix = source_dir / "distance_matrices" / f"{business_line_clean}_facility_facility_durations.csv"
        
        config.update({
            "PCP_FACILITY_MATRIX": str(pcp_facility_matrix),
            "FACILITY_FACILITY_MATRIX": str(facility_facility_matrix),
            "HAS_DISTANCE_MATRICES": pcp_facility_matrix.exists() and facility_facility_matrix.exists(),
        })
    else:
        config["HAS_DISTANCE_MATRICES"] = False
    
    # Load dynamic data counts
    try:
        import sys
        import os
        sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from models.dataloader import load_pcp_facility_data
        
        target_business_line = business_line or 'Wisconsin Geriatrics'
        pcp_data = load_pcp_facility_data(
            csv_path=config["PCP_FACILITY_FILE"],
            business_line=target_business_line
        )
        
        if pcp_data:
            config["P"] = len(pcp_data['provider_mappings'])
            config["F"] = len(pcp_data['facility_mappings'])
            config["N_F"] = _calculate_avg_patients_per_facility(pcp_data['business_line_data'], config["F"])
                
            print(f"Config loaded for {target_business_line}: {config['P']} providers, {config['F']} facilities")
        else:
            raise ValueError(f"Failed to load data for {target_business_line}")
            
    except Exception as e:
        raise ValueError(f"Could not load data for {target_business_line}: {e}")
    
    return config