# Bluestone Frontend

Enterprise React dashboard for healthcare optimization with dual-panel analytics, real-time statistics, and persistent state management. Provides comprehensive interfaces for multi-objective provider scheduling across large-scale facility networks.

## Architecture

### Core Components

- **App.js**: Main orchestrator with dual-tab architecture (Provider Scheduling / PCP Visits Dashboard)
- **ConfigPanel**: Advanced parameter configuration with collapsible sections and real-time validation
- **CalendarView**: Interactive schedule visualization with provider/facility view modes and persistent state
- **PCPVisitsView**: Comprehensive analytics dashboard with travel time calculations and filterable calendars
- **ScheduleBrowser**: Save/load functionality with schedule metadata and hover previews

### Analytics Features

- **Unified Travel Calculations**: Consistent optimal routing algorithm across all frontend components using `src/utils/optimal_travel_calculator.js`
- **Real-time Statistics**: Days worked, facilities visited, patient counts, travel time breakdowns
- **Travel Time Analytics**: Home-to-facility and inter-facility calculations with optimal routing (minimize total travel distance)
- **Persistent Filtering**: State maintained across tab switches and view mode changes
- **Dual-Panel Layout**: Configuration/statistics panel alongside interactive calendar views

### State Management

- **Persistent Filters**: Optimization and visit filters maintained across navigation
- **Statistics Aggregation**: Real-time calculation and display of comprehensive metrics
- **Session Management**: Save/load optimization results with configuration metadata

## Setup and Installation

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start Development Server**:
   ```bash
   npm start
   ```
   This will start the React development server on port 3000.

3. **Build for Production**:
   ```bash
   npm run build
   ```
   This creates a production-ready build in the `build` folder that can be served by the Flask backend.

## Backend Integration

### API Endpoints

The frontend integrates with the Flask backend through comprehensive RESTful endpoints:

**Core Optimization**:
- `/api/config`: Configuration parameters and real data availability
- `/api/run_optimization`: Multi-objective scheduling with OR-Tools/Gurobi
- `/api/providers`: Provider lists filtered by business line

**Data Management**:
- `/api/pcp_visits`: Real visit data with anonymization
- `/api/pcp_facility`: Facility metadata and business line mappings
- `/api/distance_matrix`: Google Routes API travel time calculations

**Session Management**:
- `/api/save_schedule`: Store optimization results with metadata
- `/api/load_schedule`: Retrieve saved schedules with configuration
- `/api/list_schedules`: Browse available saved optimizations
- `/api/delete_schedule`: Remove stored schedule files

### Development Proxy

API requests are automatically proxied to the backend server (http://127.0.0.1:5001) during development using the `proxy` setting in `package.json`.

## Development Features

### Modern React Patterns
- **Functional Components**: Modern hooks-based architecture with useCallback and useEffect optimization
- **State Management**: Persistent state across navigation with proper dependency management
- **Component Composition**: Reusable components with clear separation of concerns
- **Performance Optimization**: Memoized calculations and efficient re-rendering patterns

### User Experience
- **Dual-Panel Interface**: Configuration sidebar with full-screen analytics dashboard
- **Persistent Filters**: Selections maintained across tab switches and view mode changes
- **Real-time Feedback**: Live optimization progress and instant statistics updates
- **Error Handling**: Comprehensive error boundaries and user-friendly error messages
- **Responsive Design**: Optimized for various screen sizes and resolutions

### Data Processing
- **Optimal Travel Routing**: Unified travel calculation algorithm using nearest neighbor optimization for consistent results
- **Real-time Analytics**: Travel time calculations and statistics aggregation in the browser with optimal routing
- **Dynamic Filtering**: Multi-dimensional filtering with business line, provider, facility, and time ranges
- **Schedule Management**: Save/load functionality with metadata and configuration preservation

## Running the Complete Application

To run the complete application:

1. Start the Flask backend:
   ```bash
   # From the root project directory
   python app.py
   ```

2. In a separate terminal, start the React frontend:
   ```bash
   # From the frontend directory
   npm start
   ```

3. Open your browser to http://localhost:3000