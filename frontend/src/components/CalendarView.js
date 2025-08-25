import React, { useState, useEffect } from 'react';
import './CalendarView.css';

function CalendarView({ results, viewMode, config, onProviderSelect, selectedProvider, selectedEntity, onEntitySelect }) {
  const [entityOptions, setEntityOptions] = useState([]);

  // Check if we're in single provider mode
  const isSingleProviderMode = results?.optimization_mode === 'single_provider';
  const selectedProviderInResults = results?.selected_provider;

  // Setup entity options when results change
  useEffect(() => {
    if (!results || !results.schedule) {
      setEntityOptions([]);
      return;
    }

    // Extract provider and facility options
    const providerIds = Object.keys(results.schedule).sort();
    const allFacilities = new Set();
    
    if (isSingleProviderMode && selectedProviderInResults) {
      // Single provider mode - only facilities visited by selected provider
      const providerSchedule = results.schedule[selectedProviderInResults] || {};
      Object.values(providerSchedule).forEach(dayFacilities => {
        Object.keys(dayFacilities).forEach(facilityId => {
          allFacilities.add(facilityId);
        });
      });
    } else {
      // Full business line mode - all facilities from all providers
      Object.values(results.schedule).forEach(providerSchedule => {
        Object.values(providerSchedule).forEach(dayFacilities => {
          Object.keys(dayFacilities).forEach(facilityId => {
            allFacilities.add(facilityId);
          });
        });
      });
    }

    // Set options based on current view mode
    if (viewMode === 'provider') {
      const providerOptions = isSingleProviderMode && selectedProviderInResults 
        ? [{ value: selectedProviderInResults, label: selectedProviderInResults }]
        : providerIds.map(providerId => ({ value: providerId, label: providerId }));
      setEntityOptions(providerOptions);
      
      // Set initial selection if we don't have one yet
      if (providerOptions.length > 0 && !selectedEntity && onEntitySelect) {
        const initialProvider = isSingleProviderMode ? selectedProviderInResults : providerOptions[0].value;
        onEntitySelect(initialProvider, 'provider');
      }
    } else {
      const facilityOptions = Array.from(allFacilities).sort().map(facilityId => ({
        value: facilityId,
        label: facilityId,
      }));
      setEntityOptions(facilityOptions);
      
      // Set initial selection if we don't have one yet
      if (facilityOptions.length > 0 && !selectedEntity && onEntitySelect) {
        onEntitySelect(facilityOptions[0].value, 'facility');
      }
    }
  }, [config, isSingleProviderMode, selectedProviderInResults, results, viewMode, selectedEntity, onEntitySelect]);


  if (!results || !results.schedule) {
    if (results && results.status && !results.status.toLowerCase().includes('optimal')) {
      return <p>Status: {results.status}. {results.message || ''}</p>;
    }
    return <p>No schedule data available. Run the optimization.</p>;
  }

  if (!config) {
    return <p>Configuration not loaded. Please refresh the page.</p>;
  }

  const { schedule } = results;
  
  // Extract working days dynamically from schedule data (avoid metadata duplication)
  const extractWorkingDaysFromSchedule = () => {
    const allDates = new Set();
    if (results.schedule) {
      Object.values(results.schedule).forEach(providerSchedule => {
        Object.keys(providerSchedule).forEach(dateKey => {
          // Check if it's a real date (YYYY-MM-DD format)
          if (typeof dateKey === 'string' && dateKey.match(/^\d{4}-\d{2}-\d{2}$/)) {
            allDates.add(dateKey);
          }
        });
      });
    }
    return Array.from(allDates).sort();
  };

  // Try metadata first (for backward compatibility), then extract dynamically
  const workingDaysList = (results.metadata && results.metadata.working_days_list) 
    ? results.metadata.working_days_list 
    : extractWorkingDaysFromSchedule();
  
  const hasRealDates = workingDaysList.length > 0;
  
  // Calculate weeks based on actual date span
  const WEEKS = hasRealDates && workingDaysList.length > 0 ? (() => {
    // Calculate the maximum week index that any date will fall into
    const firstDate = new Date(workingDaysList[0] + 'T00:00:00');
    let maxWeekIndex = 0;
    
    workingDaysList.forEach(dateStr => {
      const date = new Date(dateStr + 'T00:00:00');
      const diffTime = date.getTime() - firstDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const weekIndex = Math.floor(diffDays / 7);
      maxWeekIndex = Math.max(maxWeekIndex, weekIndex);
    });
    
    return maxWeekIndex + 1; // +1 because indices are 0-based
  })() : (config.WEEKS || 4);
  const DAYS_PER_WEEK = 5; // Always Monday-Friday
  

  // Get the color for a provider or facility
  const getColor = (index) => {
    // Use the same color palette as PCP Visits for consistency
    const colors = [
      // Blues - Softer, more professional shades
      '#4A90E2', // Clear blue
      '#5B86E5', // Royal blue
      '#6F8EE8', // Periwinkle
      '#7E97EB', // Light royal blue
      
      // Greens - Better, more sophisticated tones
      '#7A9B7A', // Readable sage green
      '#6B8A6B', // Muted forest green
      '#DCE9D5', // Very light sage
      '#B8D4BC', // Medium sage
      
      // Warm tones - Softer and more muted
      '#E6836E', // Coral
      '#F28B7D', // Salmon
      '#FF937C', // Peach
      '#FFB59C', // Light peach
      
      // Cool tones - Professional and calming
      '#8B7DD8', // Purple
      '#9B8CE7', // Lavender
      '#AB9BF6', // Light purple
      '#BBAAFF', // Soft purple
      
      // Neutral tones - Professional and subtle
      '#9DA5B4', // Steel
      '#ADB4C3', // Cool gray
      '#BDC3D2', // Light steel
      '#CDD2E1', // Pale steel
      
      // Accent tones - Vibrant but professional
      '#F7C37B', // Gold
      '#FFD28A', // Light gold
      '#FFE199', // Pale gold
      '#FFF0A8', // Soft yellow
      
      // Additional professional tones
      '#5DADE2', // Sky blue
      '#6FC6E2', // Turquoise
      '#7FE0E2', // Aqua
      '#A9D3E0', // Soft blue-gray
      
      // Subtle accent tones
      '#B5A7E3', // Dusty purple
      '#C5B6F2', // Light dusty purple
      '#D5C5FF', // Pale purple
      '#E5D4FF'  // Very pale purple
    ];
    
    // Use the same hash function as PCP Visits for consistent color distribution
    const colorIndex = (index * 17) % colors.length;
    return colors[colorIndex];
  };

  // Parse day key - handle both real dates (YYYY-MM-DD) and legacy week_day format
  const parseDayKey = (dayKey) => {
    if (hasRealDates && dayKey.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Real date format: YYYY-MM-DD
      const dayIndex = workingDaysList.indexOf(dayKey);
      if (dayIndex === -1) return null;
      
      // Calculate actual weekday from the date (0=Monday, 1=Tuesday, etc.)
      const date = new Date(dayKey + 'T00:00:00');
      const jsWeekday = date.getDay(); // JavaScript: 0=Sunday, 1=Monday, ..., 6=Saturday
      const dayOfWeekIndex = jsWeekday === 0 ? 6 : jsWeekday - 1; // Convert to 0=Monday, ..., 4=Friday, 5=Saturday, 6=Sunday
      
      // Calculate which week this date falls into based on the first working day
      const firstDate = new Date(workingDaysList[0] + 'T00:00:00');
      const diffTime = date.getTime() - firstDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const weekIndex = Math.floor(diffDays / 7);
      
      return { weekIndex, dayOfWeekIndex, realDate: dayKey, dayIndex };
    } else {
      // Legacy format: week_1_day_3
      const parts = dayKey.split('_');
      const weekIndex = parseInt(parts[1], 10) - 1;
      const dayOfWeekIndex = parseInt(parts[3], 10) - 1;
      return { weekIndex, dayOfWeekIndex };
    }
  };


  const groupDataByWeeks = (data) => {
    const weeklyData = Array(WEEKS).fill().map(() => Array(DAYS_PER_WEEK).fill(null));
    
    // First, populate all working days with their dates (even if no schedule data)
    if (hasRealDates) {
      workingDaysList.forEach(dateStr => {
        const parsed = parseDayKey(dateStr);
        if (!parsed) return;
        
        const { weekIndex, dayOfWeekIndex } = parsed;
        if (weekIndex >= 0 && weekIndex < WEEKS && dayOfWeekIndex >= 0 && dayOfWeekIndex < DAYS_PER_WEEK) {
          if (weeklyData[weekIndex]) {
            // Initialize with just the date, no schedule data yet
            weeklyData[weekIndex][dayOfWeekIndex] = {
              realDate: parsed.realDate,
              dayIndex: parsed.dayIndex
            };
          }
        }
      });
    }
    
    // Then, add schedule data on top of the date structure
    Object.entries(data).forEach(([dayKey, value]) => {
      const parsed = parseDayKey(dayKey);
      if (!parsed) return;
      
      const { weekIndex, dayOfWeekIndex } = parsed;
      // Ensure we don't go out of bounds
      if (weekIndex >= 0 && weekIndex < WEEKS && dayOfWeekIndex >= 0 && dayOfWeekIndex < DAYS_PER_WEEK) {
        if (weeklyData[weekIndex] && weeklyData[weekIndex][dayOfWeekIndex]) {
          // CRITICAL: Preserve data structure based on view mode
          if (Array.isArray(value)) {
            // FACILITY VIEW: Preserve array of provider objects
            weeklyData[weekIndex][dayOfWeekIndex] = {
              ...weeklyData[weekIndex][dayOfWeekIndex], // Keep existing date info
              providers: value,              // [{providerId: "P79", patients: 15}]
            };
          } else {
            // PROVIDER VIEW: Spread facility object
            weeklyData[weekIndex][dayOfWeekIndex] = {
              ...weeklyData[weekIndex][dayOfWeekIndex], // Keep existing date info
              ...value,                      // {"F120": 5, "F203": 8}
            };
          }
        }
      }
    });
    
    return weeklyData;
  };

  // Get day label (Monday, Tuesday, etc.)
  const getDayLabel = (dayIndex) => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return days[dayIndex % 7];
  };
  
  // Format real date for display (e.g., "12/1" from "2024-12-01")
  const formatDateForDisplay = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString + 'T00:00:00');
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };


  const prepareData = () => {
    
    if (viewMode === 'provider') {
      // Provider view - get data for the selected provider
      if (isSingleProviderMode && selectedProviderInResults) {
        // Single provider mode - schedule uses original provider ID as key
        const providerData = schedule[selectedProviderInResults] || {};
        return groupDataByWeeks(providerData);
      } else {
        // Full business line mode - schedule now uses real provider IDs as keys
        const providerData = schedule[selectedEntity] || {};
        return groupDataByWeeks(providerData);
      }
    } else {
      // Facility view - get data for the selected facility
      const facilityData = {};
      
      Object.entries(schedule).forEach(([providerKey, days]) => {
        Object.entries(days).forEach(([dayKey, facilities]) => {
          Object.entries(facilities).forEach(([facilityKey, patients]) => {
            if (facilityKey === selectedEntity) {
              if (!facilityData[dayKey]) {
                facilityData[dayKey] = [];
              }
              
              facilityData[dayKey].push({
                providerId: providerKey,
                patients,
              });
            }
          });
        });
      });
      
      return groupDataByWeeks(facilityData);
    }
  };


  const renderBadge = (item) => {
    if (viewMode === 'provider') {
      const [facilityKey, patients] = item;
      const colorIndex = parseInt(facilityKey.substring(1)) || 0;
      
      return (
        <div 
          key={facilityKey} 
          className="entity-badge facility-badge" 
          style={{ backgroundColor: getColor(colorIndex) }}
          title={`${facilityKey} - ${patients} patients`}
        >
          <div className="facility-id">{facilityKey}</div>
          <div className="facility-count">{patients}</div>
        </div>
      );
    } else {
      const colorIndex = parseInt(item.providerId.substring(1)) || 0;
      
      return (
        <div 
          key={item.providerId} 
          className="entity-badge provider-badge" 
          style={{ backgroundColor: getColor(colorIndex) }}
          title={`${item.providerId} - ${item.patients} patients`}
        >
          <div className="facility-id">{item.providerId}</div>
          <div className="facility-count">{item.patients}</div>
        </div>
      );
    }
  };

  // Get travel time for a specific day and provider
  const getTravelTimeForDay = (dayData) => {
    if (!results.daily_travel_times || viewMode !== 'provider' || !dayData?.realDate) return null;
    
    const providerKey = isSingleProviderMode ? selectedProviderInResults : selectedEntity;
    const travelTime = results.daily_travel_times[providerKey]?.[dayData.realDate];
    
    return (travelTime && travelTime > 0) ? travelTime : null;
  };


  const renderCellContent = (dayData) => {
    if (viewMode === 'provider') {
      const actualData = dayData && typeof dayData === 'object' && !Array.isArray(dayData) && dayData.realDate !== undefined
        ? Object.fromEntries(Object.entries(dayData).filter(([key]) => !['realDate', 'dayIndex'].includes(key)))
        : dayData;
      
      const facilityEntries = actualData ? Object.entries(actualData) : [];
      const travelTime = getTravelTimeForDay(dayData);
      
      return (
        <div className="cell-content">
          {facilityEntries.length > 0 ? (
            <div className="cell-badges">
              {facilityEntries.map(item => renderBadge(item))}
            </div>
          ) : (
            <span className="empty-slot">—</span>
          )}
          {travelTime > 0 && (
            <div className="travel-time">{travelTime} h</div>
          )}
        </div>
      );
    } else {
      const dayProviders = dayData?.providers || [];
      
      return dayProviders.length > 0 ? (
        <div className="cell-badges">
          {dayProviders.map(item => renderBadge(item))}
        </div>
      ) : (
        <span className="empty-slot">—</span>
      );
    }
  };

  const weeklyData = prepareData();
  
  // Debug: Log weekly data to understand what's happening with week 5
  console.log('Calendar Debug Info:', {
    WEEKS,
    workingDaysListLength: workingDaysList.length,
    weeklyDataLength: weeklyData.length,
    weeklyDataStructure: weeklyData.map((week, idx) => ({
      weekIndex: idx,
      daysWithData: week.filter(day => day !== null).length,
      daysWithRealDates: week.filter(day => day && day.realDate).length,
      realDates: week.filter(day => day && day.realDate).map(day => day.realDate)
    }))
  });

  return (
    <div className="calendar-view">
      {/* Hide provider selector in single provider mode for provider view */}
      {!(isSingleProviderMode && viewMode === 'provider') && (
        <div className="selector-container">
          <label htmlFor="entity-selector">
            {viewMode === 'provider' ? 'Provider' : 'Facility'}:
          </label>
          <select
            id="entity-selector"
            value={selectedEntity || ''}
            onChange={(e) => {
              const newValue = e.target.value;
              if (onEntitySelect) {
                onEntitySelect(newValue, viewMode);
              }
              // Keep legacy provider selection callback
              if (onProviderSelect && viewMode === 'provider') {
                onProviderSelect(newValue);
              }
            }}
          >
            {entityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}
      
      {/* Show selected provider info in single provider mode */}
      {isSingleProviderMode && viewMode === 'provider' && (
        <div className="single-provider-header">
          <h3>Schedule for {selectedProviderInResults}</h3>
        </div>
      )}
      
      <div className="calendar-container">
        <table className="calendar-grid">
          <thead>
            <tr>
              <th className="week-column">Week</th>
              {Array.from({ length: DAYS_PER_WEEK }, (_, d) => (
                <th key={d}>{getDayLabel(d)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeklyData.map((week, weekIndex) => (
              <tr key={weekIndex} className="week-row">
                <td className="week-number">
                  {hasRealDates ? (
                    <div>
                      <div className="week-label">Week {weekIndex + 1}</div>
                      <div className="week-date-range">
                        {/* Show date range for this week based on actual dates in the week */}
                        {(() => {
                          const datesInThisWeek = week.filter(dayData => dayData && dayData.realDate)
                                                     .map(dayData => dayData.realDate)
                                                     .sort();
                          if (datesInThisWeek.length > 0) {
                            const startDate = formatDateForDisplay(datesInThisWeek[0]);
                            const endDate = formatDateForDisplay(datesInThisWeek[datesInThisWeek.length - 1]);
                            return datesInThisWeek.length === 1 ? startDate : `${startDate} - ${endDate}`;
                          }
                          return '';
                        })()}
                      </div>
                    </div>
                  ) : (
                    `Week ${weekIndex + 1}`
                  )}
                </td>
                {week.map((dayData, dayIndex) => (
                  <td key={dayIndex} className="day-cell">
                    {hasRealDates && dayData && dayData.realDate && (
                      <div className="day-date">{formatDateForDisplay(dayData.realDate)}</div>
                    )}
                    {renderCellContent(dayData)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CalendarView;