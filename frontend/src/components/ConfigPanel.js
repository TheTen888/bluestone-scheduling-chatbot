import React, { useState, useEffect, useCallback } from 'react';
import './ConfigPanel.css';
import { getDistanceMatrixData, getCensusDataForBusinessLine, getProviders, saveSchedule } from '../api';

function ConfigPanel({ config, onConfigChange, onRunOptimize, onClearResults, isLoading, results, selectedProvider }) {
  const [showModelParams, setShowModelParams] = useState(true);
  const [showDataConfig, setShowDataConfig] = useState(true);
  const [showSummary, setShowSummary] = useState(false); // State for summary visibility, start collapsed
  const [isLoadingRealData, setIsLoadingRealData] = useState(false);
  const [realDataAvailable, setRealDataAvailable] = useState(null);
  
  // New state for provider optimization
  const [optimizationMode, setOptimizationMode] = useState('full_business_line');
  const [availableProviders, setAvailableProviders] = useState([]);
  const [localSelectedProvider, setLocalSelectedProvider] = useState('');
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);

  // State for save schedule modal
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [scheduleName, setScheduleName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Debug showSaveModal state changes
  useEffect(() => {
    console.log('showSaveModal state changed to:', showSaveModal);
  }, [showSaveModal]);

  // Auto-collapse sections when results are available
  useEffect(() => {
    if (results) {
      setShowModelParams(false);
      setShowDataConfig(false);
      setShowSummary(true); // Expand summary when results arrive
    }
  }, [results]);

  // Load providers when business line changes
  useEffect(() => {
    const loadProviders = async () => {
      const businessLine = config?.BUSINESS_LINE || 'Wisconsin Geriatrics';
      setIsLoadingProviders(true);
      try {
        const providerData = await getProviders(businessLine);
        setAvailableProviders(providerData.providers || []);
        // Reset selected provider when business line changes
        setLocalSelectedProvider('');
      } catch (error) {
        console.error('Error loading providers:', error);
        setAvailableProviders([]);
      }
      setIsLoadingProviders(false);
    };

    loadProviders();
  }, [config?.BUSINESS_LINE]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    // Only CENSUS_MONTH and BUSINESS_LINE need special handling, no numeric conversions needed
    onConfigChange({ [name]: value });
    
    // Re-check real data availability when business line or census month changes
    if (name === 'BUSINESS_LINE' || name === 'CENSUS_MONTH') {
      // Small delay to allow config to update first
      setTimeout(() => {
        checkRealDataAvailability();
      }, 100);
    }
  };

  // Handler for optimization mode change
  const handleOptimizationModeChange = (event) => {
    const newMode = event.target.value;
    setOptimizationMode(newMode);
    onConfigChange({ optimization_mode: newMode });
    
    // Reset selected provider when switching modes
    if (newMode === 'full_business_line') {
      setLocalSelectedProvider('');
      onConfigChange({ selected_provider: null });
    }
  };

  // Handler for provider selection change
  const handleProviderChange = (event) => {
    const provider = event.target.value;
    setLocalSelectedProvider(provider);
    onConfigChange({ selected_provider: provider });
  };

  // Save schedule handlers
  const handleSaveSchedule = async () => {
    console.log('Save Schedule button clicked!');
    console.log('Current config:', config);
    console.log('Current results:', results);
    
    // Generate default name based on config
    const businessLine = config?.BUSINESS_LINE || config?.business_line || 'Unknown';
    const month = config?.CENSUS_MONTH || config?.census_month || '';
    const mode = config?.optimization_mode === 'single_provider' && config?.selected_provider 
      ? `${config.selected_provider}` 
      : 'Full Business Line';
    
    const defaultName = `${businessLine} ${month} - ${mode}`;
    console.log('Generated default name:', defaultName);
    
    // TEMPORARY: Skip modal and save directly for testing
    try {
      const response = await saveSchedule(results, defaultName, config);
      if (response.success) {
        alert(`Schedule saved successfully as "${defaultName}"`);
      } else {
        alert(`Failed to save schedule: ${response.error}`);
      }
    } catch (error) {
      alert(`Failed to save schedule: ${error.message}`);
    }
    
    // Original modal code (commented out for testing)
    // setScheduleName(defaultName);
    // setShowSaveModal(prev => {
    //   console.log('setShowSaveModal functional update, prev:', prev);
    //   return true;
    // });
  };

  const handleSaveConfirm = async () => {
    if (!scheduleName.trim()) {
      alert('Please enter a name for the schedule');
      return;
    }

    setIsSaving(true);
    try {
      const response = await saveSchedule(results, scheduleName.trim(), config);
      if (response.success) {
        alert(`Schedule saved successfully as "${scheduleName}"`);
        setShowSaveModal(false);
        setScheduleName('');
      } else {
        alert(`Failed to save schedule: ${response.error}`);
      }
    } catch (error) {
      alert(`Failed to save schedule: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCancel = () => {
    setShowSaveModal(false);
    setScheduleName('');
  };

  // Available business lines - prioritize Wisconsin Geriatrics (real data) first
  const businessLines = [
    'Wisconsin Geriatrics', // Real data available
    'Minnesota Geriatrics',  // Sample data
    'Florida Geriatrics',    // Sample data
    'Minnesota ADAPT'        // Sample data
  ];

  // Available months for census data
  const availableMonths = [
    { value: '2024-01', label: 'January 2024' },
    { value: '2024-02', label: 'February 2024' },
    { value: '2024-03', label: 'March 2024' },
    { value: '2024-04', label: 'April 2024' },
    { value: '2024-05', label: 'May 2024' },
    { value: '2024-06', label: 'June 2024' },
    { value: '2024-07', label: 'July 2024' },
    { value: '2024-08', label: 'August 2024' },
    { value: '2024-09', label: 'September 2024' },
    { value: '2024-10', label: 'October 2024' },
    { value: '2024-11', label: 'November 2024' },
    { value: '2024-12', label: 'December 2024' }
  ];

  // Check availability of real data
  const checkRealDataAvailability = useCallback(async () => {
    try {
      const businessLine = config?.BUSINESS_LINE || 'Wisconsin Geriatrics';
      const selectedMonth = config?.CENSUS_MONTH || '2024-01';
      
      const distanceData = await getDistanceMatrixData(businessLine);
      const censusData = await getCensusDataForBusinessLine(businessLine);
      
      // Get the actual provider count for the selected business line (with Wisconsin filtering)
      const providerData = await getProviders(businessLine);
      
      const availability = {
        hasDistanceMatrices: !!(distanceData.facilityToFacility || distanceData.pcpToFacility),
        hasCensusData: censusData.length > 0,
        hasVisitsData: providerData.providers.length > 0,
        facilityCount: 0,
        providerCount: 0,
        avgPatientsPerFacility: 0
      };

      // Get real facility count from census data for the business line
      if (censusData.length > 0) {
        availability.facilityCount = censusData.length;
        
        // Calculate average patients per facility from census data for selected month
        const totalPatients = censusData.reduce((sum, facility) => {
          const monthlyCount = parseInt(facility[selectedMonth] || 0);
          return sum + monthlyCount;
        }, 0);
        availability.avgPatientsPerFacility = Math.round(totalPatients / censusData.length);
      }
      
      // Get real provider count with filtering applied
      if (providerData.providers.length > 0) {
        availability.providerCount = providerData.providers.length;
      }

      setRealDataAvailable(availability);
    } catch (error) {
      console.error('Error checking real data availability:', error);
      setRealDataAvailable(null);
    }
  }, [config?.BUSINESS_LINE, config?.CENSUS_MONTH]);

  // Load real data parameters for Wisconsin Geriatrics
  const loadRealDataParams = async () => {
    setIsLoadingRealData(true);
    try {
      await checkRealDataAvailability();
      
      if (realDataAvailable) {
        const newConfig = {
          BUSINESS_LINE: 'Wisconsin Geriatrics',
          CENSUS_MONTH: '2024-01'  // Default to January
        };
        
        // Update each config parameter
        Object.entries(newConfig).forEach(([key, value]) => {
          onConfigChange({ [key]: value });
        });
      }
    } catch (error) {
      console.error('Error loading real data parameters:', error);
    }
    setIsLoadingRealData(false);
  };

  // Check for real data availability on component mount
  useEffect(() => {
    checkRealDataAvailability();
  }, [checkRealDataAvailability]);

  // Callback to handle clearing results and resetting section visibility
  const handleClearResultsCallback = useCallback(() => {
    onClearResults();
    setShowModelParams(true);
    setShowDataConfig(true);
    setShowSummary(false); // Collapse summary when clearing
  }, [onClearResults]); // Dependency on onClearResults

  // Handler for running optimization with validation
  const handleRunOptimization = () => {
    // Validate single provider mode
    if (optimizationMode === 'single_provider' && !localSelectedProvider) {
      alert('Please select a provider for single provider optimization.');
      return;
    }
    
    onRunOptimize();
  };

  // Check if run button should be disabled
  const isRunDisabled = () => {
    if (isLoading) return true;
    if (optimizationMode === 'single_provider' && !localSelectedProvider) return true;
    return false;
  };

  // Render optimization summary section (now collapsible)
  const renderOptimizationSummary = () => {
    if (!results) return null;

    // Add 'summary-group' class for specific styling
    return (
      <div className="parameter-group summary-group"> {/* Wrapper for collapsible section */}
        <div
          className={`section-header ${showSummary ? 'expanded' : ''}`}
          onClick={() => setShowSummary(!showSummary)}
        >
          <h3>Optimization Summary</h3>
          <span className={`toggle-icon ${showSummary ? 'expanded' : ''}`}>
            <span className="icon-content">▼</span>
          </span>
        </div>

        {/* Content area for the summary */}
        <div className={`section-content ${showSummary ? 'expanded' : ''}`}>
          {/* Conditionally render the actual summary details */}
          {showSummary && (
            <div className="stats-section">


              {/* Summary Statistics - Show individual provider when selected */}
              {results && (
                <div className="summary-section">
                  <h4>{selectedProvider ? `${selectedProvider} Statistics` : 'Summary Statistics'}</h4>
                  <div className="param-grid">
                    {(() => {
                      if (results.optimization_mode === 'single_provider') {
                        // Single provider mode - use summary_stats directly
                        const statsData = results.summary_stats || {};
                        return (
                          <>
                            <div className="param-item">
                              <span className="param-label">Days Worked:</span>
                              <span className="param-value">{statsData.days_worked || 0}</span>
                            </div>
                            <div className="param-item">
                              <span className="param-label">Facilities Visited:</span>
                              <span className="param-value">{statsData.facilities_visited || 0}</span>
                            </div>
                            <div className="param-item">
                              <span className="param-label">Total Patients Seen:</span>
                              <span className="param-value">{statsData.total_patients_seen || 0}</span>
                            </div>
                            <div className="param-item">
                              <span className="param-label">Avg Patients/Day:</span>
                              <span className="param-value">{statsData.avg_patients_per_day || 0}</span>
                            </div>
                            <div className="param-item">
                              <span className="param-label">Total Travel Time:</span>
                              <span className="param-value">{statsData.total_travel_time || 0}h</span>
                            </div>
                            <div className="param-item">
                              <span className="param-label">Avg Travel/Day:</span>
                              <span className="param-value">{statsData.avg_travel_per_day || 0}h</span>
                            </div>
                          </>
                        );
                      } else if (selectedProvider && results.schedule && results.schedule[selectedProvider]) {
                        // Business line mode with selected provider - calculate individual stats
                        const providerSchedule = results.schedule[selectedProvider];
                        const daysWorked = Object.keys(providerSchedule).length;
                        
                        // Count facilities and patients for this provider
                        const facilitiesVisited = new Set();
                        let totalPatientsServed = 0;
                        
                        Object.values(providerSchedule).forEach(dayFacilities => {
                          Object.entries(dayFacilities).forEach(([facilityId, patients]) => {
                            if (patients > 0) {
                              facilitiesVisited.add(facilityId);
                              totalPatientsServed += patients;
                            }
                          });
                        });
                        
                        // Get travel time from provider_results_summary
                        const providerSummary = results.provider_results_summary?.find(
                          summary => summary.provider_id === selectedProvider
                        );
                        const totalTravelTime = providerSummary?.travel_time || 0;
                        
                        return (
                          <>
                            <div className="param-item">
                              <span className="param-label">Days Worked:</span>
                              <span className="param-value">{daysWorked}</span>
                            </div>
                            <div className="param-item">
                              <span className="param-label">Facilities Visited:</span>
                              <span className="param-value">{facilitiesVisited.size}</span>
                            </div>
                            <div className="param-item">
                              <span className="param-label">Total Patients Seen:</span>
                              <span className="param-value">{totalPatientsServed}</span>
                            </div>
                            <div className="param-item">
                              <span className="param-label">Avg Patients/Day:</span>
                              <span className="param-value">{daysWorked > 0 ? (totalPatientsServed / daysWorked).toFixed(1) : 0}</span>
                            </div>
                            <div className="param-item">
                              <span className="param-label">Total Travel Time:</span>
                              <span className="param-value">{totalTravelTime.toFixed(1)}h</span>
                            </div>
                            <div className="param-item">
                              <span className="param-label">Avg Travel/Day:</span>
                              <span className="param-value">{daysWorked > 0 ? (totalTravelTime / daysWorked).toFixed(1) : 0}h</span>
                            </div>
                          </>
                        );
                      } else {
                        // Fallback - no provider selected or no data
                        return (
                          <>
                            <div className="param-item">
                              <span className="param-label">Days Worked:</span>
                              <span className="param-value">-</span>
                            </div>
                            <div className="param-item">
                              <span className="param-label">Facilities Visited:</span>
                              <span className="param-value">-</span>
                            </div>
                            <div className="param-item">
                              <span className="param-label">Total Patients Seen:</span>
                              <span className="param-value">-</span>
                            </div>
                            <div className="param-item">
                              <span className="param-label">Avg Patients/Day:</span>
                              <span className="param-value">-</span>
                            </div>
                            <div className="param-item">
                              <span className="param-label">Total Travel Time:</span>
                              <span className="param-value">-</span>
                            </div>
                            <div className="param-item">
                              <span className="param-label">Avg Travel/Day:</span>
                              <span className="param-value">-</span>
                            </div>
                          </>
                        );
                      }
                    })()}
                  </div>
                </div>
              )}

              {/* Travel Summary */}
              {results.total_travel_time !== undefined && (
                <div className="summary-section">
                  <h4>
                    {results.optimization_mode === 'single_provider' 
                      ? `${selectedProvider || 'Provider'} Travel Summary`
                      : 'Business Line Travel Summary'
                    }
                  </h4>
                  <div className="param-grid">
                    <div className="param-item">
                      <span className="param-label">Total Travel Time:</span>
                      <span className="param-value">{results.total_travel_time.toFixed(2)}h</span>
                    </div>
                    {results.home_to_facility_travel !== undefined && (
                      <div className="param-item">
                        <span className="param-label">Home to Facility:</span>
                        <span className="param-value">{results.home_to_facility_travel.toFixed(2)}h</span>
                      </div>
                    )}
                    {results.facility_to_facility_travel !== undefined && (
                      <div className="param-item">
                        <span className="param-label">Facility to Facility:</span>
                        <span className="param-value">{results.facility_to_facility_travel.toFixed(2)}h</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Provider Utilization */}
              {results.provider_utilization && (
                <div className="summary-section">
                  <h4>Provider Utilization</h4>
                  <div className="provider-util-grid">
                    {Object.entries(results.provider_utilization).map(([provider, util]) => (
                      <div key={provider} className="provider-util-item">
                        <span className="provider-name">{provider}</span>
                        <span className="provider-util">{util}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div> /* End of stats-section */
          )}
        </div> {/* End of section-content */}
      </div> /* End of parameter-group */
    );
  };

  // Main component render
  return (
    <div className="config-panel">
      <h2>Configuration</h2>

      <div className="sections-container">
        {/* Model Parameters Section */}
        <div className="parameter-group">
          <div 
            className={`section-header ${showModelParams ? 'expanded' : ''}`} 
            onClick={() => setShowModelParams(!showModelParams)}
          >
            <h3>Model Parameters</h3>
            <span className={`toggle-icon ${showModelParams ? 'expanded' : ''}`}>
              <span className="icon-content">▼</span>
            </span>
          </div>
          <div className={`section-content ${showModelParams ? 'expanded' : ''}`}>
            <div className="params-container">
              
              {/* Business Line Selection */}
              <div className="config-item">
                <label htmlFor="BUSINESS_LINE">Business Line:</label>
                <select 
                  id="BUSINESS_LINE" 
                  name="BUSINESS_LINE" 
                  value={config.BUSINESS_LINE || 'Wisconsin Geriatrics'} 
                  onChange={handleChange} 
                  disabled={isLoading}
                >
                  {businessLines.map(line => (
                    <option key={line} value={line}>
                      {line === 'Wisconsin Geriatrics' ? `${line} (Real Data)` : `${line} (Sample Data)`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Month Selection for Census Data */}
              <div className="config-item">
                <label htmlFor="CENSUS_MONTH">Census Month:</label>
                <select 
                  id="CENSUS_MONTH" 
                  name="CENSUS_MONTH" 
                  value={config.CENSUS_MONTH || '2024-01'} 
                  onChange={handleChange} 
                  disabled={isLoading}
                >
                  {availableMonths.map(month => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Optimization Mode Selection */}
              <div className="config-item">
                <label htmlFor="optimization_mode">Optimization Mode:</label>
                <select 
                  id="optimization_mode" 
                  name="optimization_mode" 
                  value={optimizationMode} 
                  onChange={handleOptimizationModeChange} 
                  disabled={isLoading}
                >
                  <option value="full_business_line">Full Business Line</option>
                  <option value="single_provider">Single Provider</option>
                </select>
              </div>

              {/* Max Patients Per Day Selection */}
              <div className="config-item">
                <label htmlFor="max_patients_per_day">Max Patients Per Day:</label>
                <select 
                  id="max_patients_per_day" 
                  name="max_patients_per_day" 
                  value={config.max_patients_per_day || 15} 
                  onChange={handleChange} 
                  disabled={isLoading}
                >
                  {Array.from({ length: 11 }, (_, i) => i + 10).map(num => (
                    <option key={num} value={num}>
                      {num}
                    </option>
                  ))}
                </select>
              </div>

              {/* Lambda Workload Balancing */}
              <div className="config-item">
                <label htmlFor="lambda_param">Lambda Workload (λ_w):</label>
                <select 
                  id="lambda_param" 
                  name="lambda_param" 
                  value={config.lambda_param || 0} 
                  onChange={handleChange} 
                  disabled={isLoading}
                  title="Workload balancing weight (higher = more balanced workloads across providers)"
                >
                  <option value={0}>0 (No balancing)</option>
                  <option value={0.1}>0.1 (Low)</option>
                  <option value={0.5}>0.5 (Medium)</option>
                  <option value={1.0}>1.0 (High)</option>
                  <option value={2.0}>2.0 (Very High)</option>
                </select>
              </div>

              {/* Lambda Facility Visit Frequency */}
              <div className="config-item">
                <label htmlFor="lambda_facility">Lambda Facility (λ_f):</label>
                <select 
                  id="lambda_facility" 
                  name="lambda_facility" 
                  value={config.lambda_facility || 0} 
                  onChange={handleChange} 
                  disabled={isLoading}
                  title="Facility visit frequency penalty (higher = more frequent facility visits)"
                >
                  <option value={0}>0 (No penalty)</option>
                  <option value={0.1}>0.1 (Low)</option>
                  <option value={0.5}>0.5 (Medium)</option>
                  <option value={1.0}>1.0 (High)</option>
                  <option value={5.0}>5.0 (Very High)</option>
                  <option value={10.0}>10.0 (Maximum)</option>
                </select>
              </div>

              {/* Alpha Service Level Buffer */}
              <div className="config-item">
                <label htmlFor="alpha">Alpha Service Buffer (α):</label>
                <select 
                  id="alpha" 
                  name="alpha" 
                  value={config.alpha || 0.05} 
                  onChange={handleChange} 
                  disabled={isLoading}
                  title="Service level buffer percentage (e.g., 0.05 = 5% buffer for 105% of census)"
                >
                  <option value={0}>0% (Exact census)</option>
                  <option value={0.05}>5% (105% of census)</option>
                  <option value={0.10}>10% (110% of census)</option>
                  <option value={0.15}>15% (115% of census)</option>
                  <option value={0.20}>20% (120% of census)</option>
                </select>
              </div>

              {/* Facility Visit Window */}
              <div className="config-item">
                <label htmlFor="facility_visit_window">Facility Visit Window:</label>
                <select 
                  id="facility_visit_window" 
                  name="facility_visit_window" 
                  value={config.facility_visit_window || 10} 
                  onChange={handleChange} 
                  disabled={isLoading}
                  title="Maximum days between facility visits (working days)"
                >
                  <option value={3}>3 days (Very frequent)</option>
                  <option value={5}>5 days (1 week)</option>
                  <option value={7}>7 days (1.5 weeks)</option>
                  <option value={10}>10 days (2 weeks)</option>
                  <option value={15}>15 days (3 weeks)</option>
                  <option value={20}>20 days (1 month)</option>
                </select>
              </div>

              {/* Provider Selection - Only show when single provider mode is selected */}
              {optimizationMode === 'single_provider' && (
                <div className="config-item">
                  <label htmlFor="selected_provider">Provider:</label>
                  <select 
                    id="selected_provider" 
                    name="selected_provider" 
                    value={localSelectedProvider} 
                    onChange={handleProviderChange} 
                    disabled={isLoading || isLoadingProviders || availableProviders.length === 0}
                  >
                    <option value="">
                      {isLoadingProviders ? 'Loading providers...' : 'Select a provider'}
                    </option>
                    {availableProviders.map(provider => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </select>
                  {availableProviders.length === 0 && !isLoadingProviders && (
                    <div className="config-note">
                      No providers available for {config.BUSINESS_LINE || 'Wisconsin Geriatrics'}
                    </div>
                  )}
                </div>
              )}

              {/* Real data parameters are automatically determined and displayed in Data Preview */}
            </div>
          </div>
        </div>

        {/* Data Configuration Section */}
        <div className="parameter-group">
          <div 
            className={`section-header ${showDataConfig ? 'expanded' : ''}`} 
            onClick={() => setShowDataConfig(!showDataConfig)}
          >
            <h3>Data Preview</h3>
            <span className={`toggle-icon ${showDataConfig ? 'expanded' : ''}`}>
              <span className="icon-content">▼</span>
            </span>
          </div>
          <div className={`section-content ${showDataConfig ? 'expanded' : ''}`}>
            <div className="params-container">
              
              {/* Real Data Status and Load Button */}
              {realDataAvailable && (
                <div className="config-item real-data-section">
                  <div className="real-data-status">
                    <h4>Wisconsin Geriatrics Real Data:</h4>
                    <div className="data-counts">
                      <div className="count-item">
                        <span className="count-label">Providers:</span>
                        <span className="count-value">{realDataAvailable.providerCount}</span>
                      </div>
                      <div className="count-item">
                        <span className="count-label">Facilities:</span>
                        <span className="count-value">{realDataAvailable.facilityCount}</span>
                      </div>
                      <div className="count-item">
                        <span className="count-label">Avg Patients/Month:</span>
                        <span className="count-value">{realDataAvailable.avgPatientsPerFacility}</span>
                      </div>
                    </div>
                  </div>
                  <button 
                    className="load-real-data-button"
                    onClick={loadRealDataParams}
                    disabled={isLoading || isLoadingRealData}
                  >
                    {isLoadingRealData ? 'Loading Real Data...' : 'Load Wisconsin Geriatrics Data'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Optimization Summary Section - Rendered conditionally */}

      </div> {/* End of sections-container */}

      <div className="button-container">
        <div className="button-group">
          <button className="run-button" onClick={handleRunOptimization} disabled={isRunDisabled()}>
            {isLoading ? 'Running Optimization...' : 'Run Optimization'}
          </button>
          {results && (
            <button
              className="save-button"
              onClick={handleSaveSchedule}
              disabled={isLoading}
              title="Save this optimization result to load later"
            >
              Save Schedule
            </button>
          )}
          {results && (
            <button
              className="clear-button"
              onClick={handleClearResultsCallback} // Use the callback here
              disabled={isLoading}
              title="Clear results and try a new configuration"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Optimization Summary Section - Rendered conditionally below buttons */}
      {renderOptimizationSummary()}

      {/* Save Schedule Modal */}
      {showSaveModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Save Schedule</h3>
            <p>Enter a name for this schedule:</p>
            <input
              type="text"
              value={scheduleName}
              onChange={(e) => setScheduleName(e.target.value)}
              placeholder="Schedule name..."
              className="schedule-name-input"
              disabled={isSaving}
            />
            <div className="modal-buttons">
              <button 
                onClick={handleSaveCancel}
                className="cancel-button"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveConfirm}
                className="confirm-button"
                disabled={isSaving || !scheduleName.trim()}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div> /* End of config-panel */
  );
}

export default ConfigPanel;