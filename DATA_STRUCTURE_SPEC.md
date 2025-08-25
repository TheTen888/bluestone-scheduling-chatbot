# Healthcare Optimization Data Structure Specification

## Overview
This document defines the standardized data structure used for both **Single Provider Mode** and **Full Business Line Mode** optimizations to ensure consistent frontend processing.

## Backend API Response Format

Both optimization modes return identical data structures with real provider and facility IDs (not indexed keys).

### Core Response Structure

```json
{
  "optimization_mode": "single_provider" | "full_business_line_sequential",
  "status": "Optimal" | "Combined Sequential Optimization",
  "schedule": {
    "P79": {
      "2024-12-02": {
        "F602": 6,
        "F120": 8
      },
      "2024-12-03": {
        "F602": 12,
        "F203": 5
      }
    },
    "P104": {
      "2024-12-02": {
        "F508": 10
      }
    }
  },
  "provider_utilization": {
    "P79": 57.3,
    "P104": 52.7
  },
  "daily_travel_times": {
    "P79": {
      "2024-12-02": 2.5,
      "2024-12-03": 3.1
    },
    "P104": {
      "2024-12-02": 1.8
    }
  },
  "metadata": {
    "working_days_list": ["2024-12-02", "2024-12-03", "..."],
    "business_line": "Wisconsin Geriatrics",
    "census_month": "2024-12",
    "data_source": "real_census_data",
    "date_range": "2024-12-02 to 2024-12-31"
  },
  "total_patients_served": 3473,
  "total_patient_demand": 3473,
  "total_travel_time": 112.23,
  "overall_utilization": 48.9
}
```

## Key Data Structure Rules

### 1. Real ID Usage (Critical)
- **Provider Keys**: Use original provider IDs like `"P79"`, `"P104"`, NOT indexed keys like `"provider_0"`
- **Facility Keys**: Use original facility IDs like `"F602"`, `"F120"`, NOT indexed keys like `"facility_14"`
- **Date Keys**: Use ISO date format `"2024-12-02"`, NOT indexed keys like `"week_1_day_3"`

### 2. Schedule Structure
```json
"schedule": {
  "<REAL_PROVIDER_ID>": {
    "<ISO_DATE>": {
      "<REAL_FACILITY_ID>": <PATIENT_COUNT>
    }
  }
}
```

### 3. Provider Utilization
```json
"provider_utilization": {
  "<REAL_PROVIDER_ID>": <UTILIZATION_PERCENTAGE>
}
```

### 4. Daily Travel Times
```json
"daily_travel_times": {
  "<REAL_PROVIDER_ID>": {
    "<ISO_DATE>": <TRAVEL_HOURS>
  }
}
```

### 5. Essential Metadata
```json
"metadata": {
  "working_days_list": ["2024-12-02", "2024-12-03", ...],  // Required for frontend calendar
  "business_line": "Wisconsin Geriatrics",
  "census_month": "2024-12",
  "data_source": "real_census_data"
}
```

## Mode-Specific Differences

### Single Provider Mode
- `optimization_mode`: `"single_provider"`
- `selected_provider`: `"P79"` (the optimized provider)
- `schedule`: Contains only one provider key
- Frontend shows only the selected provider in dropdown

### Full Business Line Mode  
- `optimization_mode`: `"full_business_line_sequential"`
- `schedule`: Contains multiple provider keys (`"P79"`, `"P104"`, etc.)
- Frontend shows all providers in dropdown

## Frontend Processing

The frontend treats both modes identically:

### Provider View Dropdown
```javascript
// Extract provider IDs from schedule keys
const providerIds = Object.keys(results.schedule).sort(); // ["P104", "P112", "P79"]

// Single provider: show only selected provider
// Full business line: show all providers
```

### Facility View Dropdown
```javascript
// Extract facility IDs from all provider schedules
const allFacilities = new Set();
Object.values(results.schedule).forEach(providerSchedule => {
  Object.values(providerSchedule).forEach(dayFacilities => {
    Object.keys(dayFacilities).forEach(facilityId => {
      allFacilities.add(facilityId); // "F602", "F120", etc.
    });
  });
});
```

### Data Access
```javascript
// Provider view: access schedule directly with real provider ID
const providerData = schedule[selectedProviderID]; // selectedProviderID = "P79"

// Facility view: filter by real facility ID
const facilityMatches = (facilityId === selectedFacilityID); // facilityId = "F602"
```

## Backend Implementation Points

### Key Conversion in `combine_provider_results()`
```python
# Convert indexed keys to real IDs
reverse_facility_mapping = {idx: fid for fid, idx in pcp_data['facility_mappings'].items()}

# For each provider result
for facility_key, patients in facilities.items():
    facility_idx = int(facility_key.split('_')[1])  # "facility_14" -> 14
    original_facility_id = reverse_facility_mapping.get(facility_idx, facility_key)  # 14 -> "F602"
    original_schedule_for_provider[day][original_facility_id] = patients

# Use real provider ID as schedule key
combined_results['schedule'][provider_id] = original_schedule_for_provider  # "P79", not "provider_0"
```

### Metadata Preservation
```python
# Include essential metadata from individual provider results
base_metadata = provider_results[0].get('metadata', {})
combined_results['metadata'] = {
    # ... other fields ...
    'working_days_list': base_metadata.get('working_days_list', []),  # Critical for frontend
    'data_source': base_metadata.get('data_source', 'real_census_data')
}
```

## Validation Checklist

✅ **Backend Returns Real IDs**: 
- Schedule keys are `"P79"`, `"P104"` not `"provider_0"`
- Facility keys are `"F602"`, `"F120"` not `"facility_14"`

✅ **Frontend Extracts Real IDs**:
- Dropdown options use `Object.keys(results.schedule)` 
- Travel times use real provider IDs as keys

✅ **Consistent Data Format**:
- Both modes return identical structure
- Frontend processes both modes with same logic

✅ **Essential Metadata Included**:
- `working_days_list` present for calendar dates
- Travel times use real provider IDs as keys

This standardized structure ensures both Single Provider and Full Business Line modes work identically in the frontend with real, human-readable IDs throughout.