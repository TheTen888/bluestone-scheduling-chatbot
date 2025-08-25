import React, { useState, useEffect, useCallback } from 'react';
import ConfigPanel from './components/ConfigPanel';
import CalendarView from './components/CalendarView';
import PCPVisitsView from './components/PCPVisitsView';
import ScheduleBrowser from './components/ScheduleBrowser';
import { runOptimization, loadSchedule } from './api'; // Assuming api.js is in the same directory
import './App.css';

function App() {
  const [config, setConfig] = useState(null);
  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('scheduler'); // Set scheduler as the default tab
  
  // Optimization tab filter state - preserved across tab switches
  const [optimizationFilters, setOptimizationFilters] = useState({
    viewMode: 'provider', // 'provider' or 'facility'
    selectedProviderInCalendar: null, // Track selected provider from calendar (legacy)
    selectedProvider: null, // Currently selected provider in calendar
    selectedFacility: null // Currently selected facility in calendar
  });
  
  // Visit tab filter state - preserved across tab switches
  const [visitFilters, setVisitFilters] = useState({
    viewMode: 'provider',
    selectedProvider: '',
    selectedFacility: '',
    selectedBusinessLine: '',
    selectedMonth: 1, // Default to January to match data
    selectedYear: 2024 // Default to 2024 to match data
  });
  
  // Visit tab statistics state
  const [visitStats, setVisitStats] = useState({
    totalVisits: 0,
    uniqueDays: 0,
    uniqueFacilities: 0,
    uniqueProviders: 0,
    avgVisitsPerDay: 0,
    totalPatients: 0,
    avgPatientsPerDay: 0
  });
  
  // Handler for optimization tab filter changes
  const handleOptimizationFiltersChange = useCallback((newFilters) => {
    setOptimizationFilters(prevFilters => ({ ...prevFilters, ...newFilters }));
  }, []);

  // Handler for provider selection changes from calendar (legacy)
  const handleProviderSelection = useCallback((providerId) => {
    handleOptimizationFiltersChange({ selectedProviderInCalendar: providerId });
  }, [handleOptimizationFiltersChange]);

  // Handler for calendar entity selection changes (provider or facility)
  const handleCalendarEntitySelection = useCallback((entityId, viewMode) => {
    if (viewMode === 'provider') {
      handleOptimizationFiltersChange({ 
        selectedProvider: entityId,
        selectedProviderInCalendar: entityId // Keep legacy field in sync
      });
    } else {
      handleOptimizationFiltersChange({ selectedFacility: entityId });
    }
  }, [handleOptimizationFiltersChange]);

  // Handler for visit tab filter changes
  const handleVisitFiltersChange = useCallback((newFilters) => {
    setVisitFilters(prevFilters => ({ ...prevFilters, ...newFilters }));
  }, []);

  // Handler for visit tab statistics changes
  const handleVisitStatsChange = useCallback((newStats) => {
    setVisitStats(newStats);
  }, []);

  // Initialize with default config instead of loading from backend
  useEffect(() => {
    if (activeTab === 'scheduler' && !config) {
      // Set default configuration
      const defaultConfig = {
        BUSINESS_LINE: 'Wisconsin Geriatrics',
        CENSUS_MONTH: '2024-01',
        optimization_mode: 'full_business_line',
        selected_provider: null,
        max_patients_per_day: 15,
        // New facility visit gap constraint parameters
        lambda_param: 0,        // Workload balancing weight
        lambda_facility: 0,   // Facility visit gap penalty weight
        alpha: 0.05,           // Service level buffer (5% default)
        facility_visit_window: 10  // Facility visit gap window (working days)
      };
      setConfig(defaultConfig);
    }
  }, [activeTab, config]);

  // Handle configuration changes from ConfigPanel
  const handleConfigChange = useCallback((newConfig) => {
    setConfig(prevConfig => ({ ...prevConfig, ...newConfig }));
  }, []);

  // Handle running the optimization
  const handleRunOptimization = useCallback(() => {
    if (!config) {
      setError("Configuration not loaded yet.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setResults(null); // Clear previous results
          runOptimization(config)
      .then(data => {
        console.log('Received optimization data:', data);
        if (data.success === false) {
          setError(data.error || "Optimization failed. Check backend logs.");
          setResults(null);
        } else if (data.results && data.results.status && data.results.status.toLowerCase().includes('infeasible')) {
          setError(`Optimization resulted in an infeasible model: ${data.results.message || ''}`);
          setResults(data.results); // Pass the nested results
        } else if (data.success && data.results) {
          setResults(data.results); // Extract the nested results
          setError(null);
        } else {
          setError("Unexpected response format from optimization.");
          setResults(null);
        }
      })
      .catch(err => {
        console.error("Error running optimization:", err);
        setError("Failed to run optimization. Check backend connection and logs.");
        setResults(null);
      })
      .finally(() => setIsLoading(false));
  }, [config]); // Dependency on config ensures the latest values are sent

  // Clear results to start fresh
  const handleClearResults = useCallback(() => {
    setResults(null);
    setError(null);
    handleOptimizationFiltersChange({ selectedProviderInCalendar: null }); // Reset selected provider
  }, [handleOptimizationFiltersChange]);

  // Handle loading a saved schedule
  const handleLoadSchedule = useCallback(async (filename) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await loadSchedule(filename);
      if (response.success && response.data) {
        const scheduleData = response.data;
        
        // Only handle new format schedules with proper metadata
        if (!scheduleData.metadata || !scheduleData.metadata.original_config) {
          setError('This schedule was saved in an old format and is not supported. Please save new schedules.');
          setIsLoading(false);
          return;
        }
        
        // Restore the original configuration
        setConfig(scheduleData.metadata.original_config);
        
        // Set the results
        setResults(scheduleData);
        
        // Switch to scheduler tab to view the loaded schedule
        setActiveTab('scheduler');
        
        console.log('Schedule loaded successfully:', {
          status: scheduleData.status,
          hasSchedule: !!scheduleData.schedule,
          scheduleKeys: scheduleData.schedule ? Object.keys(scheduleData.schedule).length : 0
        });
      } else {
        setError(response.error || 'Failed to load schedule');
      }
    } catch (error) {
      console.error('Error loading schedule:', error);
      setError(`Failed to load schedule: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Bluestone Provider Scheduling</h1>
        <nav className="tabs-navigation">
          <button 
            className={activeTab === 'scheduler' ? 'tab-active' : ''}
            onClick={() => setActiveTab('scheduler')}
          >
            Provider Scheduling
          </button>
          <button 
            className={activeTab === 'visits' ? 'tab-active' : ''}
            onClick={() => setActiveTab('visits')}
          >
            PCP Visits Dashboard
          </button>
        </nav>
      </header>
      
      <div className="App-body">
        {activeTab === 'scheduler' ? (
          <>
        <div className="config-section">
          {config ? (
            <ConfigPanel
              config={config}
              onConfigChange={handleConfigChange}
              onRunOptimize={handleRunOptimization}
              onClearResults={handleClearResults}
              isLoading={isLoading}
              results={results}
              selectedProvider={optimizationFilters.selectedProviderInCalendar}
            />
          ) : (
            <p>Loading configuration...</p>
          )}
           {/* Display optimization errors here */}
           {error && !isLoading && <p className="error-message">Error: {error}</p>}
        </div>
        
        <div className="results-section">
          <div className="results-container">
            <div className="results-title">
              Schedule View
            </div>
            
            <div className="view-toggle">
              <button
                onClick={() => handleOptimizationFiltersChange({ viewMode: 'provider' })}
                disabled={optimizationFilters.viewMode === 'provider'}
                className={optimizationFilters.viewMode === 'provider' ? 'active' : ''}
              >
                Provider View
              </button>
              <button
                onClick={() => handleOptimizationFiltersChange({ viewMode: 'facility' })}
                disabled={optimizationFilters.viewMode === 'facility'}
                className={optimizationFilters.viewMode === 'facility' ? 'active' : ''}
              >
                    Facility View
              </button>
            </div>
            
            <div className="results-content">
              {isLoading ? (
                <div className="message-container">
                   <div className="loading-spinner"></div>
                   <p>Running Optimization...</p>
                </div>
              ) : results && results.schedule ? (
                <CalendarView 
                  results={results} 
                  viewMode={optimizationFilters.viewMode} 
                  config={config}
                  onProviderSelect={handleProviderSelection}
                  selectedProvider={optimizationFilters.selectedProviderInCalendar}
                  selectedEntity={optimizationFilters.viewMode === 'provider' ? optimizationFilters.selectedProvider : optimizationFilters.selectedFacility}
                  onEntitySelect={handleCalendarEntitySelection}
                />
              ) : !error ? (
                <ScheduleBrowser onLoadSchedule={handleLoadSchedule} />
              ) : (
                <div className="message-container">
                   <p>{error}</p>
                   {results && results.status && !results.schedule && (
                     <p>Status: {results.status}. {results.message || ''}</p>
                   )}
                </div>
              )}
            </div>
          </div>
        </div>
          </>
        ) : (
          <>
            <div className="config-section">
              <div className="config-panel">
                <h2>PCP Visits Dashboard</h2>
                {/* Statistics Panel */}
                <div className="parameter-group summary-group">
                  <div className="section-header expanded">
                    <h3>Key Statistics</h3>
                  </div>
                  <div className="section-content expanded">
                    <div className="stats-section">
                      
                      {/* Main Statistics Section - matches ConfigPanel format exactly */}
                      <div className="summary-section">
                        <h4>
                          {visitFilters?.viewMode === 'provider' && visitFilters?.selectedProvider 
                            ? `${visitFilters.selectedProvider} Statistics`
                            : visitFilters?.viewMode === 'facility' && visitFilters?.selectedFacility
                            ? `${visitFilters.selectedFacility} Statistics` 
                            : `${visitFilters?.viewMode === 'provider' ? 'All Providers' : 'All Facilities'} Statistics`
                          }
                        </h4>
                        <div className="param-grid">
                          <div className="param-item">
                            <span className="param-label">Days Worked:</span>
                            <span className="param-value">{visitStats.uniqueDays}</span>
                          </div>
                          <div className="param-item">
                            <span className="param-label">{visitFilters?.viewMode === 'provider' ? 'Facilities Visited:' : 'Providers Seen:'}</span>
                            <span className="param-value">{visitFilters?.viewMode === 'provider' ? visitStats.uniqueFacilities : visitStats.uniqueProviders}</span>
                          </div>
                          <div className="param-item">
                            <span className="param-label">Total Patients Seen:</span>
                            <span className="param-value">{visitStats.totalPatients}</span>
                          </div>
                          <div className="param-item">
                            <span className="param-label">Avg Patients/Day:</span>
                            <span className="param-value">{visitStats.avgPatientsPerDay}</span>
                          </div>
                          {/* Travel time metrics - only show for provider view with data */}
                          {visitFilters?.viewMode === 'provider' && visitStats.totalTravelTime > 0 && (
                            <>
                              <div className="param-item">
                                <span className="param-label">Total Travel Time:</span>
                                <span className="param-value">{visitStats.totalTravelTime}h</span>
                              </div>
                              <div className="param-item">
                                <span className="param-label">Avg Travel/Day:</span>
                                <span className="param-value">{visitStats.avgTravelPerDay}h</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Travel Summary Section - only show for provider view with travel data */}
                      {visitFilters?.viewMode === 'provider' && visitStats.totalTravelTime > 0 && (
                        <div className="summary-section">
                          <h4>
                            {visitFilters?.selectedProvider 
                              ? `${visitFilters.selectedProvider} Travel Summary`
                              : 'Provider Travel Summary'
                            }
                          </h4>
                          <div className="param-grid">
                            <div className="param-item">
                              <span className="param-label">Total Travel Time:</span>
                              <span className="param-value">{visitStats.totalTravelTime.toFixed(2)}h</span>
                            </div>
                            <div className="param-item">
                              <span className="param-label">Home to Facility:</span>
                              <span className="param-value">{visitStats.homeToFacilityTravel.toFixed(2)}h</span>
                            </div>
                            <div className="param-item">
                              <span className="param-label">Facility to Facility:</span>
                              <span className="param-value">{visitStats.facilityToFacilityTravel.toFixed(2)}h</span>
                            </div>
                          </div>
                        </div>
                      )}
                      
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="results-section">
              <div className="results-container">
                <div className="results-title">
                  Visits Calendar View
                </div>
                
                <div className="results-content">
                  <PCPVisitsView 
                    filters={visitFilters}
                    onFiltersChange={handleVisitFiltersChange}
                    onStatsChange={handleVisitStatsChange}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;