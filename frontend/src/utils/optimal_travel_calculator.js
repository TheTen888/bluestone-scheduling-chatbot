/**
 * Optimal Travel Calculator
 * 
 * Implements unified travel time calculation using the same optimization principles
 * as the Gurobi and OR-Tools models: minimize home-to-facility + facility-to-facility travel.
 * 
 * This ensures consistent travel calculations across:
 * - Scheduler tab (optimization results)
 * - Visit tab (visit data analysis) 
 * - Python scripts (post-calculation analysis)
 */

/**
 * Calculate optimal daily travel time for a provider visiting multiple facilities
 * Uses the same logic as optimization models:
 * - Home travel: minimum distance to closest facility visited that day
 * - Facility-to-facility: optimal routing between facilities
 * 
 * @param {string} providerId - Provider ID (e.g., "P79")
 * @param {Array} facilities - Array of facility objects: [{facilityId: "F430", totalVisits: 13}, ...]
 * @param {Object} distanceMatrices - Distance matrices: {pcpToFacility: df, facilityToFacility: df}
 * @returns {Object} Travel breakdown: {homeTravel, facilityTravel, totalTravel, details}
 */
export function calculateOptimalDailyTravel(providerId, facilities, distanceMatrices) {
  if (!facilities || facilities.length === 0) {
    return {
      homeTravel: 0,
      facilityTravel: 0, 
      totalTravel: 0,
      details: []
    };
  }

  const { pcpToFacility, facilityToFacility } = distanceMatrices;
  const details = [];
  
  // Step 1: Calculate optimal home travel (minimum distance to any facility visited)
  let homeTravel = Infinity;
  let closestFacility = null;
  
  facilities.forEach(facility => {
    const travelTime = getTravelTime(pcpToFacility, providerId, facility.facilityId);
    if (travelTime < homeTravel) {
      homeTravel = travelTime;
      closestFacility = facility.facilityId;
    }
  });
  
  if (homeTravel === Infinity) {
    homeTravel = 0;
  }
  
  if (closestFacility) {
    details.push(`Home → ${closestFacility}: ${homeTravel.toFixed(2)}h`);
  }
  
  // Step 2: Calculate optimal facility-to-facility travel
  let facilityTravel = 0;
  
  if (facilities.length > 1) {
    // For multiple facilities, find optimal routing
    // Start from the closest facility (already visited from home)
    const remainingFacilities = facilities.filter(f => f.facilityId !== closestFacility);
    let currentFacility = closestFacility;
    
    // Greedy nearest neighbor approach for facility routing
    while (remainingFacilities.length > 0) {
      let nearestDistance = Infinity;
      let nearestFacilityIndex = -1;
      
      // eslint-disable-next-line no-loop-func
      remainingFacilities.forEach((facility, index) => {
        const travelTime = getTravelTime(facilityToFacility, currentFacility, facility.facilityId);
        if (travelTime < nearestDistance) {
          nearestDistance = travelTime;
          nearestFacilityIndex = index;
        }
      });
      
      if (nearestFacilityIndex >= 0) {
        const nextFacility = remainingFacilities[nearestFacilityIndex];
        facilityTravel += nearestDistance;
        details.push(`${currentFacility} → ${nextFacility.facilityId}: ${nearestDistance.toFixed(2)}h`);
        
        currentFacility = nextFacility.facilityId;
        remainingFacilities.splice(nearestFacilityIndex, 1);
      } else {
        break;
      }
    }
  }
  
  const totalTravel = homeTravel + facilityTravel;
  
  return {
    homeTravel: Math.round(homeTravel * 100) / 100,
    facilityTravel: Math.round(facilityTravel * 100) / 100,
    totalTravel: Math.round(totalTravel * 100) / 100,
    details
  };
}

/**
 * Calculate optimal travel statistics for a provider across multiple days
 * Aggregates daily optimal travel calculations
 * 
 * @param {string} providerId - Provider ID
 * @param {Object} dailyVisits - Daily visits: {date: [{facilityId, totalVisits}, ...], ...}
 * @param {Object} distanceMatrices - Distance matrices
 * @returns {Object} Aggregated travel statistics
 */
export function calculateOptimalTravelStatistics(providerId, dailyVisits, distanceMatrices) {
  let totalHomeToFacility = 0;
  let totalFacilityToFacility = 0;
  let daysWithTravel = 0;
  const dailyBreakdown = {};
  
  Object.keys(dailyVisits).forEach(date => {
    const facilities = dailyVisits[date];
    if (facilities.length === 0) return;
    
    const dayResult = calculateOptimalDailyTravel(providerId, facilities, distanceMatrices);
    
    if (dayResult.totalTravel > 0) {
      daysWithTravel++;
      totalHomeToFacility += dayResult.homeTravel;
      totalFacilityToFacility += dayResult.facilityTravel;
      
      dailyBreakdown[date] = {
        homeTravel: dayResult.homeTravel,
        facilityTravel: dayResult.facilityTravel,
        totalTravel: dayResult.totalTravel,
        details: dayResult.details
      };
    }
  });
  
  const totalTravelTime = totalHomeToFacility + totalFacilityToFacility;
  const avgTravelPerDay = daysWithTravel > 0 ? totalTravelTime / daysWithTravel : 0;
  
  return {
    totalTravelTime: Math.round(totalTravelTime * 100) / 100,
    avgTravelPerDay: Math.round(avgTravelPerDay * 100) / 100,
    homeToFacilityTravel: Math.round(totalHomeToFacility * 100) / 100,
    facilityToFacilityTravel: Math.round(totalFacilityToFacility * 100) / 100,
    daysWithTravel,
    dailyBreakdown
  };
}

/**
 * Helper function to get travel time from distance matrix
 * Handles missing data gracefully
 * 
 * @param {Object} matrix - Distance matrix (DataFrame-like object)
 * @param {string} from - From location ID
 * @param {string} to - To location ID
 * @returns {number} Travel time in hours
 */
function getTravelTime(matrix, from, to) {
  if (!matrix || !matrix[from] || matrix[from][to] === undefined || matrix[from][to] === null) {
    return 0;
  }
  
  const travelTime = parseFloat(matrix[from][to]);
  return isNaN(travelTime) ? 0 : travelTime;
}

/**
 * Convert distance matrices from backend format to internal format
 * Backend provides matrices as nested objects
 * 
 * @param {Object} backendMatrices - Matrices from backend API
 * @returns {Object} Formatted matrices for internal use
 */
export function formatDistanceMatrices(backendMatrices) {
  return {
    pcpToFacility: backendMatrices.pcpToFacility || {},
    facilityToFacility: backendMatrices.facilityToFacility || {}
  };
}