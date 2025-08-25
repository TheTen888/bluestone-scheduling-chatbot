import React, { useState, useEffect, useCallback } from 'react';
import { getPCPVisitsData, getPCPFacilityData, getDistanceMatrixData } from '../api';
import { calculateOptimalTravelStatistics, calculateOptimalDailyTravel, formatDistanceMatrices } from '../utils/optimal_travel_calculator';
import './CalendarView.css'; // Reuse existing CSS styles
import './PCPVisitsView.css'; // Import specific CSS for this component
import './ConfigPanel.css'; // Import for param-grid and param-item styles

function PCPVisitsView({ filters, onFiltersChange, onStatsChange }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [visitsData, setVisitsData] = useState([]);
  const [facilityData, setFacilityData] = useState([]);
  const [distanceMatrices, setDistanceMatrices] = useState({});
  const [allProviders, setAllProviders] = useState([]);
  const [allFacilities, setAllFacilities] = useState([]);
  const [providers, setProviders] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [businessLines, setBusinessLines] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [availableYears, setAvailableYears] = useState([]);

  // Use filters from props or default values
  const viewMode = filters?.viewMode || 'provider';
  const selectedProvider = filters?.selectedProvider || '';
  const selectedFacility = filters?.selectedFacility || '';
  const selectedBusinessLine = filters?.selectedBusinessLine || '';
  const selectedMonth = filters?.selectedMonth || 1; // Default to January to match data
  const selectedYear = filters?.selectedYear || 2024; // Default to 2024 to match data


  // Months for dropdown
  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

  /**
   * Calculate comprehensive statistics including travel times for current filters
   * Matches the schedule tab statistics format and data structure
   * @returns {Object} Statistics object with all metrics for display
   */
  const calculateStatistics = useCallback(() => {
    if (!filteredData || filteredData.length === 0) {
      return {
        // Basic statistics
        totalVisits: 0,
        uniqueDays: 0,
        uniqueFacilities: 0,
        uniqueProviders: 0,
        avgVisitsPerDay: 0,
        totalPatients: 0,
        avgPatientsPerDay: 0,
        // Travel time statistics
        totalTravelTime: 0,
        avgTravelPerDay: 0,
        homeToFacilityTravel: 0,
        facilityToFacilityTravel: 0
      };
    }

    const uniqueDays = new Set();
    const uniqueFacilities = new Set();
    const uniqueProviders = new Set();
    let totalPatients = 0;

    // Process visit data for basic statistics
    filteredData.forEach(visit => {
      const serviceDate = visit['Service Date Start'];
      if (serviceDate) uniqueDays.add(serviceDate.toISOString().split('T')[0]); // Convert to YYYY-MM-DD string
      
      const facilityId = visit['Service Site UiD'];
      if (facilityId) uniqueFacilities.add(facilityId);
      
      const providerId = visit['Provider UiD'];
      if (providerId) uniqueProviders.add(providerId);
      
      // Count patients using Total Visits field which represents actual patient visits
      const patientCount = parseInt(visit['Total Visits']) || 0;
      totalPatients += patientCount;
    });

    const daysWorked = uniqueDays.size;
    const avgVisitsPerDay = daysWorked > 0 ? (filteredData.length / daysWorked).toFixed(1) : 0;
    const avgPatientsPerDay = daysWorked > 0 ? (totalPatients / daysWorked).toFixed(1) : 0;

    // Travel time statistics will be calculated separately to avoid circular dependency
    // This ensures clean separation of concerns and maintainable code
    const travelStats = {
      totalTravelTime: 0,
      avgTravelPerDay: 0,
      homeToFacilityTravel: 0,
      facilityToFacilityTravel: 0
    };

    return {
      // Basic statistics
      totalVisits: filteredData.length,
      uniqueDays: daysWorked,
      uniqueFacilities: uniqueFacilities.size,
      uniqueProviders: uniqueProviders.size,
      avgVisitsPerDay: parseFloat(avgVisitsPerDay),
      totalPatients,
      avgPatientsPerDay: parseFloat(avgPatientsPerDay),
      // Travel time statistics
      ...travelStats
    };
  }, [filteredData]);


  /**
   * Calculate travel time statistics exactly like Python script
   * Groups visits by date first, then calculates daily travel times
   * @returns {Object} Travel statistics matching Python calculate_travel_time.py
   */
  const calculateTravelStatistics = useCallback(() => {
    if (viewMode !== 'provider' || !selectedProvider || Object.keys(distanceMatrices).length === 0 || !filteredData.length) {
      return {
        totalTravelTime: 0,
        avgTravelPerDay: 0,
        homeToFacilityTravel: 0,
        facilityToFacilityTravel: 0
      };
    }
    
    // Group visits by date using same approach as before
    const sortedData = [...filteredData].sort((a, b) => 
      a['Service Date Start'].getTime() - b['Service Date Start'].getTime()
    );
    
    const dailyVisits = {};
    sortedData.forEach(visit => {
      const date = visit['Service Date Start'].toISOString().split('T')[0];
      const facilityId = visit['Service Site UiD'];
      const totalVisits = parseInt(visit['Total Visits']) || 0;
      
      if (!dailyVisits[date]) {
        dailyVisits[date] = [];
      }
      dailyVisits[date].push({ facilityId, totalVisits });
    });
    
    // Use optimal travel calculation with unified standard
    const formattedMatrices = formatDistanceMatrices(distanceMatrices);
    const optimalStats = calculateOptimalTravelStatistics(selectedProvider, dailyVisits, formattedMatrices);
    
    console.log('Frontend Travel Calculation (Optimal):', {
      provider: selectedProvider,
      daysWithTravel: optimalStats.daysWithTravel,
      totalTravelTime: optimalStats.totalTravelTime,
      homeToFacilityTravel: optimalStats.homeToFacilityTravel,
      facilityToFacilityTravel: optimalStats.facilityToFacilityTravel,
      avgTravelPerDay: optimalStats.avgTravelPerDay
    });
    
    return {
      totalTravelTime: optimalStats.totalTravelTime,
      avgTravelPerDay: optimalStats.avgTravelPerDay,
      homeToFacilityTravel: optimalStats.homeToFacilityTravel,
      facilityToFacilityTravel: optimalStats.facilityToFacilityTravel
    };
  }, [viewMode, selectedProvider, distanceMatrices, filteredData]);

  // Basic statistics calculated immediately
  const basicStats = calculateStatistics();

  // Generate color for any ID (facility or provider)
  const getIdColor = (id) => {
    // Diverse color palette with distinct color families
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
    
    // Extract numeric part from any ID format (e.g., "F123", "P456", "123" -> 123, 456, 123)
    const matches = id.match(/\d+/);
    const idNum = matches ? parseInt(matches[0]) : 0;
    
    // Use a hash function to distribute colors more uniquely
    // This combines the ID number with a prime number to create better distribution
    const colorIndex = (idNum * 17) % colors.length;
    return colors[colorIndex];
  };


  // Get the day label (Monday, Tuesday, etc.)
  const getDayLabel = (dayIndex) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayIndex];
  };

  // Function to format date in a readable format
  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      month: 'numeric', 
      day: 'numeric'
    });
  };

  // Weekday indices - Monday(1) through Friday(5) only, no weekends
  const weekdayIndices = [1, 2, 3, 4, 5];


  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [visitsData, facilityData, distanceData] = await Promise.all([
          getPCPVisitsData(),
          getPCPFacilityData(),
          getDistanceMatrixData('Wisconsin Geriatrics')
        ]);
        
        const uniqueProviders = [...new Set(visitsData.map(row => row['Provider UiD']))];
        const uniqueFacilities = [...new Set(visitsData.map(row => row['Service Site UiD']))];
        const uniqueBusinessLines = [...new Set(facilityData.map(row => row['Business Line']))];
        const years = [...new Set(visitsData.map(row => row['Service Date Start'].getFullYear()))].sort();
        
        setVisitsData(visitsData);
        setFacilityData(facilityData);
        setDistanceMatrices(distanceData);
        setAllProviders(uniqueProviders);
        setAllFacilities(uniqueFacilities);
        setProviders(uniqueProviders);
        setFacilities(uniqueFacilities);
        setBusinessLines(uniqueBusinessLines);
        setAvailableYears(years);
        setLoading(false);
      } catch (err) {
        setError('Failed to load PCP Visits data');
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);


  // Set initial filter values after data loads
  useEffect(() => {
    if (!loading && onFiltersChange) {
      const updates = {};
      
      // Set year if available and not already set
      if (!selectedYear && availableYears.length > 0) {
        updates.selectedYear = availableYears[availableYears.length - 1];
      }
      
      // Set provider if in provider view and not already set
      if (viewMode === 'provider' && !selectedProvider && allProviders.length > 0) {
        updates.selectedProvider = allProviders[0];
      }
      
      // Set facility if in facility view and not already set
      if (viewMode === 'facility' && !selectedFacility && allFacilities.length > 0) {
        updates.selectedFacility = allFacilities[0];
      }
      
      // Only call onFiltersChange if we have updates
      if (Object.keys(updates).length > 0) {
        onFiltersChange(updates);
      }
    }
  }, [loading, viewMode, availableYears, allProviders, allFacilities, selectedYear, selectedProvider, selectedFacility, onFiltersChange]);

  // Create a mapping function to get business line for a provider-facility combination
  const getBusinessLineForVisit = useCallback((providerUid, facilityUid) => {
    const facilityRecord = facilityData.find(row => 
      row['Anonymized_PCP_UID'] === providerUid && 
      row['Anonymized_Facility_UID'] === facilityUid
    );
    return facilityRecord ? facilityRecord['Business Line'] : null;
  }, [facilityData]);

  // Update providers and facilities when business line changes
  useEffect(() => {
    if (!facilityData.length || !allProviders.length || !allFacilities.length) return;

    const filteredProviders = selectedBusinessLine
      ? allProviders.filter(provider => 
          facilityData.some(row => row['Anonymized_PCP_UID'] === provider && row['Business Line'] === selectedBusinessLine)
        )
      : [...allProviders];

    const filteredFacilities = selectedBusinessLine
      ? allFacilities.filter(facility =>
          facilityData.some(row => row['Anonymized_Facility_UID'] === facility && row['Business Line'] === selectedBusinessLine)
        )
      : [...allFacilities];

    setProviders(filteredProviders);
    setFacilities(filteredFacilities);

    // Reset selections if not in filtered list
    const updates = {};
    if (viewMode === 'provider' && filteredProviders.length > 0 && !filteredProviders.includes(selectedProvider)) {
      updates.selectedProvider = filteredProviders[0];
    }
    if (viewMode === 'facility' && filteredFacilities.length > 0 && !filteredFacilities.includes(selectedFacility)) {
      updates.selectedFacility = filteredFacilities[0];
    }

    if (Object.keys(updates).length > 0 && onFiltersChange) {
      onFiltersChange(updates);
    }
  }, [selectedBusinessLine, viewMode, facilityData, allProviders, allFacilities, selectedProvider, selectedFacility, onFiltersChange]);

  useEffect(() => {
    if (visitsData.length === 0) {
      setFilteredData([]);
      return;
    }

    const filtered = visitsData.filter(visit => {
      const visitDate = visit['Service Date Start'];
      const matchesDate = visitDate.getMonth() + 1 === selectedMonth && 
                         visitDate.getFullYear() === selectedYear;
      
      let matchesBusinessLine = true;
      if (selectedBusinessLine) {
        const visitBusinessLine = getBusinessLineForVisit(visit['Provider UiD'], visit['Service Site UiD']);
        matchesBusinessLine = visitBusinessLine === selectedBusinessLine;
      }
      
      const matchesView = viewMode === 'provider' 
        ? (!selectedProvider || visit['Provider UiD'] === selectedProvider)
        : (!selectedFacility || visit['Service Site UiD'] === selectedFacility);
      
      return matchesDate && matchesBusinessLine && matchesView;
    });
    
    setFilteredData(filtered);
  }, [selectedProvider, selectedFacility, selectedBusinessLine, selectedMonth, selectedYear, viewMode, visitsData, getBusinessLineForVisit]);


  // Group data by weeks with date ranges
  const getWeeklyData = () => {
    const weekMap = new Map();
    
    // Get all unique dates from filtered data to determine date range
    const allDates = [...new Set(filteredData.map(visit => 
      visit['Service Date Start'].toISOString().split('T')[0]
    ))].sort();
    
    if (allDates.length === 0) {
      // No data - generate empty month structure with minimum weeks (like scheduler)
      
      // Generate minimum 4 weeks for consistent layout
      for (let weekNum = 1; weekNum <= 4; weekNum++) {
        weekMap.set(weekNum, {
          days: Array(7).fill(null).map(() => ({
            count: 0,
            visits: [],
            facilities: new Map(),
            providers: new Map(),
            date: null,
            travelTime: 0
          })),
          startDate: null,
          endDate: null
        });
      }
    } else {
      // Generate full month structure regardless of visit data (like scheduler)
      const firstDate = new Date(allDates[0] + 'T00:00:00');
      
      // Calculate max weeks needed based on date span, but ensure minimum month coverage
      let maxWeekIndex = 0;
      allDates.forEach(dateStr => {
        const date = new Date(dateStr + 'T00:00:00');
        const diffTime = date.getTime() - firstDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const weekIndex = Math.floor(diffDays / 7);
        maxWeekIndex = Math.max(maxWeekIndex, weekIndex);
      });
      
      // Use same fallback logic as CalendarView: ensure minimum weeks for full month display
      const totalWeeks = Math.max(maxWeekIndex + 1, 4); // Minimum 4 weeks like scheduler
      
      // Generate weeks based on first date (same as scheduler)
      for (let weekIndex = 0; weekIndex < totalWeeks; weekIndex++) {
        const weekStartDate = new Date(firstDate);
        weekStartDate.setDate(weekStartDate.getDate() + (weekIndex * 7));
        
        const weekEndDate = new Date(weekStartDate);
        weekEndDate.setDate(weekEndDate.getDate() + 6);
        
        weekMap.set(weekIndex + 1, {
          days: Array(7).fill(null).map((_, dayIndex) => ({
            count: 0,
            visits: [],
            facilities: new Map(),
            providers: new Map(),
            date: null,
            travelTime: 0
          })),
          startDate: new Date(weekStartDate), // Ensure immutable copy
          endDate: new Date(weekEndDate) // Ensure immutable copy
        });
      }
    }
    
    // Now process visit data and populate the existing week structure
    filteredData.forEach(visit => {
      const visitDate = visit['Service Date Start'];
      const weekday = visit['Weekday'];
      const facilityId = visit['Service Site UiD'];
      const providerId = visit['Provider UiD'];
      
      // Use the same week calculation as CalendarView for alignment
      if (allDates.length > 0) {
        const firstDate = new Date(allDates[0] + 'T00:00:00');
        const diffTime = visitDate.getTime() - firstDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const weekIndex = Math.floor(diffDays / 7);
        const targetWeek = weekIndex + 1; // Convert 0-based to 1-based
        
        // If we found the week, populate the data
        if (targetWeek && weekMap.has(targetWeek)) {
          const weekData = weekMap.get(targetWeek);
          weekData.days[weekday].count += parseInt(visit['Total Visits']) || 0;
          weekData.days[weekday].visits.push(visit);
          // Always populate the date for visits (same as scheduler)
          weekData.days[weekday].date = visitDate;
          
          // Track facility visits
          const facilityVisits = weekData.days[weekday].facilities.get(facilityId) || 
            { id: facilityId, count: 0, inPerson: 0, telehealth: 0 };
          
          facilityVisits.count += parseInt(visit['Total Visits']) || 0;
          facilityVisits.inPerson += parseInt(visit['In Person']) || 0;
          facilityVisits.telehealth += parseInt(visit['Telehealth']) || 0;
          
          weekData.days[weekday].facilities.set(facilityId, facilityVisits);
          
          // Track provider visits
          const providerVisits = weekData.days[weekday].providers.get(providerId) || 
            { id: providerId, count: 0, inPerson: 0, telehealth: 0 };
          
          providerVisits.count += parseInt(visit['Total Visits']) || 0;
          providerVisits.inPerson += parseInt(visit['In Person']) || 0;
          providerVisits.telehealth += parseInt(visit['Telehealth']) || 0;
          
          weekData.days[weekday].providers.set(providerId, providerVisits);
        }
      }
    });
    
    // Calculate travel times for each day in provider view using same Python-style logic
    if (viewMode === 'provider' && selectedProvider && Object.keys(distanceMatrices).length > 0) {
      console.log('Starting travel time calculations for provider:', selectedProvider);
      
      // Use same daily visits grouping as statistics calculation
      // Sort filteredData by date first (like Python script does)
      const sortedData = [...filteredData].sort((a, b) => 
        a['Service Date Start'].getTime() - b['Service Date Start'].getTime()
      );
      
      const dailyVisits = {};
      sortedData.forEach(visit => {
        const date = visit['Service Date Start'].toISOString().split('T')[0];
        const facilityId = visit['Service Site UiD'];
        const totalVisits = parseInt(visit['Total Visits']) || 0;
        
        if (!dailyVisits[date]) {
          dailyVisits[date] = [];
        }
        dailyVisits[date].push({ facilityId, totalVisits });
      });

      // Calculate optimal daily travel for each date and assign to corresponding day
      const formattedMatrices = formatDistanceMatrices(distanceMatrices);
      
      weekMap.forEach((weekData) => {
        weekData.days.forEach((dayData, dayIndex) => {
          if (dayData.date) {
            const dateStr = dayData.date.toISOString().split('T')[0];
            const facilities = dailyVisits[dateStr] || [];
            
            if (facilities.length > 0) {
              // Use optimal travel calculation for daily travel time
              const dayResult = calculateOptimalDailyTravel(selectedProvider, facilities, formattedMatrices);
              
              console.log(`Optimal calc for ${dateStr}:`, {
                facilities: facilities.map(f => `${f.facilityId}:${f.totalVisits}`),
                homeTravel: dayResult.homeTravel,
                facilityTravel: dayResult.facilityTravel,
                totalTravel: dayResult.totalTravel,
                details: dayResult.details
              });
              
              dayData.travelTime = dayResult.totalTravel;
            }
          }
        });
      });
    } else {
      console.log('Travel time calculation skipped:', {
        viewMode,
        selectedProvider,
        hasDistanceMatrices: Object.keys(distanceMatrices).length > 0,
        distanceMatrixKeys: Object.keys(distanceMatrices)
      });
    }

    // Convert map to sorted array
    return Array.from(weekMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([week, data]) => ({
        week,
        days: data.days,
        startDate: data.startDate,
        endDate: data.endDate
      }));
  };

  const weeklyData = getWeeklyData();
  
  // Debug: Log weekly data structure
  console.log('Weekly data generated:', {
    weeklyDataLength: weeklyData.length,
    firstWeek: weeklyData[0],
    sampleDay: weeklyData[0]?.days?.[1] // Monday
  });

  // Pass combined statistics to parent component when they change
  useEffect(() => {
    // Calculate travel statistics and combine with basic stats inside useEffect
    const travelStats = calculateTravelStatistics();
    const combinedStats = {
      ...basicStats,
      ...travelStats
    };
    
    if (onStatsChange) {
      onStatsChange(combinedStats);
    }
  }, [basicStats, calculateTravelStatistics, onStatsChange]);

  // Render badges for a day (facilities in provider view, providers in facility view)
  const renderBadges = (dayData) => {
    if (viewMode === 'provider') {
      // Provider view: show facilities
      if (!dayData.facilities || dayData.facilities.size === 0) {
        return <span className="empty-slot">—</span>;
      }
      
      // Sort facilities by visit count (highest first)
      const sortedFacilities = Array.from(dayData.facilities.values())
        .sort((a, b) => b.count - a.count);
      
      return sortedFacilities.map(facility => (
        <div 
          key={facility.id} 
          className="facility-badge"
          style={{ backgroundColor: getIdColor(facility.id) }}
          title={`Facility ${facility.id}: ${facility.count} visits (In-Person: ${facility.inPerson}, Telehealth: ${facility.telehealth})`}
        >
          <div className="facility-id">{facility.id}</div>
          <div className="facility-count">{facility.count}</div>
          <div className="facility-breakdown">
            {facility.inPerson > 0 && 
              <span className="in-person">IP:{facility.inPerson}</span>
            }
            {facility.inPerson > 0 && facility.telehealth > 0 && ' | '}
            {facility.telehealth > 0 && 
              <span className="telehealth">Tel:{facility.telehealth}</span>
            }
          </div>
        </div>
      ));
    } else {
      // Facility view: show providers with identical styling
      if (!dayData.providers || dayData.providers.size === 0) {
        return <span className="empty-slot">—</span>;
      }
      
      // Sort providers by visit count (highest first)
      const sortedProviders = Array.from(dayData.providers.values())
        .sort((a, b) => b.count - a.count);
      
      return sortedProviders.map(provider => (
        <div 
          key={provider.id} 
          className="facility-badge"
          style={{ backgroundColor: getIdColor(provider.id) }}
          title={`Provider ${provider.id}: ${provider.count} visits (In-Person: ${provider.inPerson}, Telehealth: ${provider.telehealth})`}
        >
          <div className="facility-id">{provider.id}</div>
          <div className="facility-count">{provider.count}</div>
          <div className="facility-breakdown">
            {provider.inPerson > 0 && 
              <span className="in-person">IP:{provider.inPerson}</span>
            }
            {provider.inPerson > 0 && provider.telehealth > 0 && ' | '}
            {provider.telehealth > 0 && 
              <span className="telehealth">Tel:{provider.telehealth}</span>
            }
          </div>
        </div>
      ));
    }
  };

  if (loading) {
    return <div className="loading-container">Loading PCP Visits data...</div>;
  }

  if (error) {
    return <div className="error-container">{error}</div>;
  }

  return (
    <div className="calendar-view">
      {/* View Toggle */}
      <div className="view-toggle">
        <button 
          className={viewMode === 'provider' ? 'active' : ''}
          onClick={() => onFiltersChange && onFiltersChange({ viewMode: 'provider' })}
        >
          Provider View
        </button>
        <button 
          className={viewMode === 'facility' ? 'active' : ''}
          onClick={() => onFiltersChange && onFiltersChange({ viewMode: 'facility' })}
        >
          Facility View
        </button>
      </div>
      
      <div className="filters-container">
        <div className="filter">
          <label htmlFor="business-line-selector">Business Line:</label>
          <select
            id="business-line-selector"
            value={selectedBusinessLine}
            onChange={(e) => onFiltersChange && onFiltersChange({ selectedBusinessLine: e.target.value })}
          >
            <option value="">All Business Lines</option>
            {businessLines.map((businessLine) => (
              <option key={businessLine} value={businessLine}>
                {businessLine}
              </option>
            ))}
          </select>
        </div>
        
        {viewMode === 'provider' ? (
          <div className="filter">
            <label htmlFor="provider-selector">Provider:</label>
            <select
              id="provider-selector"
              value={selectedProvider}
              onChange={(e) => onFiltersChange && onFiltersChange({ selectedProvider: e.target.value })}
            >
              {providers.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="filter">
            <label htmlFor="facility-selector">Facility:</label>
            <select
              id="facility-selector"
              value={selectedFacility}
              onChange={(e) => onFiltersChange && onFiltersChange({ selectedFacility: e.target.value })}
            >
              {facilities.map((facility) => (
                <option key={facility} value={facility}>
                  {facility}
                </option>
              ))}
            </select>
          </div>
        )}
        
        <div className="filter">
          <label htmlFor="year-selector">Year:</label>
          <select
            id="year-selector"
            value={selectedYear}
            onChange={(e) => onFiltersChange && onFiltersChange({ selectedYear: parseInt(e.target.value, 10) })}
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        
        <div className="filter">
          <label htmlFor="month-selector">Month:</label>
          <select
            id="month-selector"
            value={selectedMonth}
            onChange={(e) => onFiltersChange && onFiltersChange({ selectedMonth: parseInt(e.target.value, 10) })}
          >
            {months.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      
      <div className="calendar-container">
        {weeklyData.length > 0 ? (
          <table className="calendar-grid">
            <thead>
              <tr>
                <th className="week-column">Week</th>
                {weekdayIndices.map((dayIndex) => (
                  <th key={dayIndex} style={{ width: `${100 / weekdayIndices.length}%` }}>
                    {getDayLabel(dayIndex)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeklyData.map((week) => (
                <tr key={week.week} className="week-row">
                  <td className="week-number">
                    <div className="week-label">Week {week.week}</div>
                    {week.startDate && week.endDate && (
                      <div className="week-date-range">
                        {formatDate(week.startDate)} - {formatDate(week.endDate)}
                      </div>
                    )}
                  </td>
                  {weekdayIndices.map((dayIndex) => (
                    <td key={dayIndex} className="day-cell">
                      {week.days[dayIndex].date && (
                        <div className="day-date">{formatDate(week.days[dayIndex].date)}</div>
                      )}
                      {week.days[dayIndex].count > 0 ? (
                        <div className="cell-content">
                          <div className="visits-total">{week.days[dayIndex].count} visits</div>
                          <div className="cell-badges">
                            {renderBadges(week.days[dayIndex])}
                          </div>
                          {viewMode === 'provider' && week.days[dayIndex].travelTime > 0 && (
                            <div className="travel-time">
                              {week.days[dayIndex].travelTime.toFixed(2)} h
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="empty-slot">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="no-data-message">
            {visitsData.length === 0 ? 
              "Loading visits data..." : 
              "No visits data found for the selected filters. Try adjusting the month, year, or business line."
            }
          </div>
        )}
      </div>
    </div>
  );
}

export default PCPVisitsView;
