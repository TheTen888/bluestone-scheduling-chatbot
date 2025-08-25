// Use relative URLs to leverage React's proxy for external access
// React dev server will proxy /api/* requests to localhost:5001
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

/**
 * Fetches the default configuration from the backend.
 * @returns {Promise<object>} A promise that resolves to the config object.
 */
export const getConfig = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching config:", error);
    throw error; // Re-throw to be caught by the caller
  }
};

// Function to fetch and process PCP Visits data
export const getPCPVisitsData = async () => {
  try {
    // Load directly from public folder instead of API
    const response = await fetch('/PCP_Visits.csv');
    
    // Check if file exists/response is ok
    if (!response.ok) {
      console.warn('PCP_Visits.csv not found. Returning sample data for development.');
      return generateSampleVisitsData();
    }
    
    const csvText = await response.text();
    
    // Parse CSV text into array of objects
    const lines = csvText.split('\n');
    const headers = lines[0].split(',');
    
    const data = lines.slice(1).filter(line => line.trim() !== '').map(line => {
      const values = line.split(',');
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = values[index];
      });
      return obj;
    });
    
    // Process dates
    data.forEach(row => {
      if (row['Service Date Start']) {
        const date = new Date(row['Service Date Start']);
        row['Service Date Start'] = date;
        row['Weekday'] = date.getDay();
        
        // Get week of year (US style, starting from 0)
        const startOfYear = new Date(date.getFullYear(), 0, 1);
        const days = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
        row['Calendar_Week'] = Math.ceil((days + startOfYear.getDay()) / 7);
      }
    });
    
    return data;
  } catch (error) {
    console.error('Error fetching PCP Visits data:', error);
    // Return sample data for development when data is missing or error occurs
    return generateSampleVisitsData();
  }
};

// Generate sample data for development when CSV is not available
const generateSampleVisitsData = () => {
  const sampleData = [];
  const currentYear = new Date().getFullYear();
  const providers = ['P1', 'P2', 'P3'];
  const facilities = ['F1', 'F2', 'F3', 'F4', 'F5'];
  
  // Generate 3 months of sample data
  for (let month = 1; month <= 3; month++) {
    // Generate data for each weekday in the month
    const daysInMonth = new Date(currentYear, month, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, month - 1, day);
      const weekday = date.getDay();
      
      // Skip weekends
      if (weekday === 0 || weekday === 6) continue;
      
      // For each provider, generate 1-3 facility visits per day
      providers.forEach(provider => {
        // Randomly determine if provider works this day (70% chance)
        if (Math.random() < 0.7) {
          // Generate 1-3 facility visits
          const numFacilities = Math.floor(Math.random() * 3) + 1;
          const visitedFacilities = [];
          
          // Select random facilities without duplicates
          while (visitedFacilities.length < numFacilities) {
            const facilityId = facilities[Math.floor(Math.random() * facilities.length)];
            if (!visitedFacilities.includes(facilityId)) {
              visitedFacilities.push(facilityId);
            }
          }
          
          // Create visit record for each facility
          visitedFacilities.forEach(facilityId => {
            const totalVisits = Math.floor(Math.random() * 20) + 5;
            const inPerson = Math.floor(Math.random() * totalVisits);
            const telehealth = totalVisits - inPerson;
            
            sampleData.push({
              'Provider UiD': provider,
              'Service Site UiD': facilityId,
              'Service Date Start': date,
              'Total Visits': totalVisits.toString(),
              'In Person': inPerson.toString(),
              'Telehealth': telehealth.toString(),
              'Weekday': weekday,
              'Calendar_Week': Math.ceil((day + new Date(currentYear, month - 1, 1).getDay()) / 7)
            });
          });
        }
      });
    }
  }
  
  return sampleData;
};

// Function to get unique Provider UIDs
export const getUniqueProviders = async () => {
  try {
    const data = await getPCPVisitsData();
    const uniqueProviders = [...new Set(data.map(row => row['Provider UiD']))];
    return uniqueProviders;
  } catch (error) {
    console.error('Error getting unique providers:', error);
    throw error;
  }
};

// Function to load census data
export const getCensusData = async () => {
  try {
    // Load anonymized census data from public folder
    const response = await fetch('/Census.csv');
    
    if (!response.ok) {
      console.warn('Census data not found. Returning empty data.');
      return [];
    }
    
    const csvText = await response.text();
    
    // Parse CSV text into array of objects
    const lines = csvText.split('\n');
    const headers = lines[0].split(',');
    
    const data = lines.slice(1).filter(line => line.trim() !== '').map(line => {
      const values = line.split(',');
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = values[index];
      });
      return obj;
    });
    
    return data;
  } catch (error) {
    console.error('Error fetching census data:', error);
    return [];
  }
};

// Function to load distance matrix data for a specific business line
export const getDistanceMatrixData = async (businessLine) => {
  try {
    const safeName = businessLine.replace(' ', '_');
    
    // Load both facility-facility and pcp-facility matrices
    const facilityFacilityUrl = `/distance_matrices/${safeName}_facility_facility_durations.csv`;
    const pcpFacilityUrl = `/distance_matrices/${safeName}_pcp_facility_durations.csv`;
    
    const [facilityResponse, pcpResponse] = await Promise.all([
      fetch(facilityFacilityUrl).catch(() => null),
      fetch(pcpFacilityUrl).catch(() => null)
    ]);
    
    const result = {};
    
    // Parse facility-facility matrix if available
    if (facilityResponse && facilityResponse.ok) {
      const csvText = await facilityResponse.text();
      result.facilityToFacility = parseCSVMatrix(csvText);
    }
    
    // Parse PCP-facility matrix if available
    if (pcpResponse && pcpResponse.ok) {
      const csvText = await pcpResponse.text();
      result.pcpToFacility = parseCSVMatrix(csvText);
    }
    
    return result;
  } catch (error) {
    console.error('Error fetching distance matrix data:', error);
    return {};
  }
};

// Helper function to parse CSV matrix data
const parseCSVMatrix = (csvText) => {
  const lines = csvText.split('\n').filter(line => line.trim() !== '');
  if (lines.length === 0) return null;
  
  // First line contains column headers (facility/provider IDs)
  const headers = lines[0].split(',').slice(1); // Remove first empty column
  
  const matrix = {};
  
  // Parse each row
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const rowId = values[0]; // First column is the row ID
    
    matrix[rowId] = {};
    for (let j = 1; j < values.length; j++) {
      const colId = headers[j - 1];
      const value = parseFloat(values[j]);
      if (!isNaN(value)) {
        matrix[rowId][colId] = value;
      }
    }
  }
  
  return matrix;
};

// Function to get census data for a specific business line
export const getCensusDataForBusinessLine = async (businessLine) => {
  try {
    const allCensusData = await getCensusData();
    
    // Filter census data by business line
    const filteredData = allCensusData.filter(row => 
      row['Business Line'] === businessLine
    );
    
    return filteredData;
  } catch (error) {
    console.error('Error filtering census data:', error);
    return [];
  }
};

// Get data parameters based on business line and census month
export const getDataParameters = async (businessLine = 'Wisconsin Geriatrics', censusMonth = '2024-01') => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/data_parameters?business_line=${encodeURIComponent(businessLine)}&census_month=${censusMonth}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching data parameters:', error);
        // Return fallback data
        return {
            provider_count: 24,
            facility_count: 183,
            avg_patients_per_month: 25,
            business_line: businessLine,
            census_month: censusMonth,
            error: error.message
        };
    }
};

// Get available business lines
export const getBusinessLines = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/business_lines`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching business lines:', error);
        return ['Wisconsin Geriatrics']; // Fallback
    }
};

// Get available census months
export const getCensusMonths = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/census_months`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching census months:', error);
        return ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06',
                '2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12']; // Fallback
    }
};

// Get available providers for a specific business line
export const getProviders = async (businessLine = 'Wisconsin Geriatrics') => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/providers?business_line=${encodeURIComponent(businessLine)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching providers:', error);
        return {
            providers: [],
            total_providers: 0,
            business_line: businessLine,
            error: error.message
        };
    }
};

// Load dataset and validate data files
export const loadDataset = async (businessLine, censusMonth) => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/load_dataset`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                business_line: businessLine,
                census_month: censusMonth
            }),
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error loading dataset:', error);
        return {
            success: false,
            error: error.message,
            data_type: 'real',
            business_line: businessLine,
            census_month: censusMonth
        };
    }
};

// Run optimization with the selected parameters
export const runOptimization = async (config) => {
    try {
        console.log('Sending optimization request:', config);
        
        // Prepare the request payload with the new provider optimization parameters
        const payload = {
            business_line: config.BUSINESS_LINE || config.business_line || 'Wisconsin Geriatrics',
            census_month: config.CENSUS_MONTH || config.census_month || '2024-01',
            optimization_mode: config.optimization_mode || 'full_business_line',
            selected_provider: config.selected_provider || null,
            // Include any other config parameters as needed
            ...config
        };
        
        const response = await fetch(`${API_BASE_URL}/api/run_optimization`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Optimization response:', result);
        return result;
    } catch (error) {
        console.error('Error running optimization:', error);
        return {
            success: false,
            error: error.message,
            results: null
        };
    }
};

// Health check endpoint
export const healthCheck = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/health`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error in health check:', error);
        return {
            status: 'error',
            error: error.message
        };
    }
};

// Load real anonymized data for frontend display
export const loadAnonymizedData = async () => {
    const data = {
        visits: null,
        distanceMatrices: {},
        census: null
    };

    try {
        // Load visits data
        const visitsResponse = await fetch('/PCP_Visits.csv');
        if (visitsResponse.ok) {
            const visitsText = await visitsResponse.text();
            data.visits = parseCSV(visitsText);
        }
    } catch (error) {
        console.warn('Could not load visits data:', error);
    }

    try {
        // Load distance matrices
        const matrices = [
            'Wisconsin_Geriatrics_pcp_facility_durations',
            'Wisconsin_Geriatrics_facility_facility_durations'
        ];

        for (const matrix of matrices) {
            try {
                const response = await fetch(`/distance_matrices/${matrix}.csv`);
                if (response.ok) {
                    const text = await response.text();
                    data.distanceMatrices[matrix] = parseCSV(text);
                }
            } catch (error) {
                console.warn(`Could not load ${matrix}:`, error);
            }
        }
    } catch (error) {
        console.warn('Could not load distance matrices:', error);
    }

    try {
        // Load census data
        const censusResponse = await fetch('/Census.csv');
        if (censusResponse.ok) {
            const censusText = await censusResponse.text();
            data.census = parseCSV(censusText);
        }
    } catch (error) {
        console.warn('Could not load census data:', error);
    }

    return data;
};

// Function to fetch and process PCP Facility data
export const getPCPFacilityData = async () => {
  try {
    // Load directly from public folder
    const response = await fetch('/PCP_Facility.csv');
    
    // Check if file exists/response is ok
    if (!response.ok) {
      console.warn('PCP_Facility.csv not found. Returning empty data.');
      return [];
    }
    
    const csvText = await response.text();
    
    // Parse CSV text into array of objects
    const lines = csvText.split('\n');
    const headers = lines[0].split(',');
    
    const data = lines.slice(1).filter(line => line.trim() !== '').map(line => {
      const values = line.split(',');
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = values[index];
      });
      return obj;
    });
    
    return data;
  } catch (error) {
    console.error('Error fetching PCP Facility data:', error);
    return [];
  }
};

// Helper function to parse CSV text into arrays
const parseCSV = (csvText) => {
    const lines = csvText.trim().split('\n');
    return lines.map(line => {
        // Simple CSV parsing - assumes no commas within quoted fields
        return line.split(',').map(cell => cell.trim());
    });
};

// Schedule management API functions
export const getSavedSchedules = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/saved_schedules`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching saved schedules:', error);
        return { schedules: [] };
    }
};

export const loadSchedule = async (filename) => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/load_schedule/${encodeURIComponent(filename)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error loading schedule:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

export const saveSchedule = async (scheduleData, name, config) => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/save_schedule`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                schedule_data: scheduleData,
                name: name,
                config: config
            }),
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error saving schedule:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

export const deleteSchedule = async (filename) => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/delete_schedule/${encodeURIComponent(filename)}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error deleting schedule:', error);
        return {
            success: false,
            error: error.message
        };
    }
};