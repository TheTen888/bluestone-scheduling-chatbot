import React, { useState, useEffect } from 'react';
import { getSavedSchedules, deleteSchedule } from '../api';
import './ScheduleBrowser.css';

function ScheduleBrowser({ onLoadSchedule }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoveredSchedule, setHoveredSchedule] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    loadSchedules();
  }, []);

  const loadSchedules = async () => {
    try {
      setLoading(true);
      const response = await getSavedSchedules();
      if (response.schedules) {
        setSchedules(response.schedules);
      } else if (response.error) {
        setError(response.error);
      }
    } catch (err) {
      setError('Failed to load saved schedules');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (filename, event) => {
    event.stopPropagation(); // Prevent triggering the load schedule
    
    if (window.confirm('Are you sure you want to delete this schedule?')) {
      try {
        const response = await deleteSchedule(filename);
        if (response.success) {
          // Refresh the schedule list
          await loadSchedules();
        } else {
          alert(`Failed to delete schedule: ${response.error}`);
        }
      } catch (err) {
        alert(`Failed to delete schedule: ${err.message}`);
      }
    }
  };

  const handleMouseEnter = (schedule, event) => {
    setHoveredSchedule(schedule);
    setMousePosition({ x: event.clientX, y: event.clientY });
  };

  const handleMouseMove = (event) => {
    if (hoveredSchedule) {
      setMousePosition({ x: event.clientX, y: event.clientY });
    }
  };

  const handleMouseLeave = () => {
    setHoveredSchedule(null);
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
    return Math.round(bytes / 1048576) + ' MB';
  };

  if (loading) {
    return (
      <div className="schedule-browser">
        <div className="loading-message">Loading saved schedules...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="schedule-browser">
        <div className="error-message">Error: {error}</div>
      </div>
    );
  }

  if (schedules.length === 0) {
    return (
      <div className="schedule-browser">
        <h2>Schedule Database</h2>
        <div className="no-schedules-message">
          <p>No saved schedules found.</p>
          <p>Run an optimization and click "Save Schedule" to build your schedule database.</p>
          <p>Your saved schedules will appear here as browsable cards with hover previews.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="schedule-browser">
      <h2>Saved Schedules</h2>
      <p className="browser-description">
        Click on a schedule to load it. Hover over a card to see configuration details.
      </p>
      
      <div className="schedule-grid">
        {schedules.map((schedule) => (
          <div
            key={schedule.filename}
            className="schedule-card"
            onClick={() => onLoadSchedule(schedule.filename)}
            onMouseEnter={(e) => handleMouseEnter(schedule, e)}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <div className="schedule-header">
              <h3 className="schedule-title">{schedule.display_name}</h3>
              <button
                className="delete-button"
                onClick={(e) => handleDelete(schedule.filename, e)}
                title="Delete schedule"
              >
                ×
              </button>
            </div>
            
            <div className="schedule-info">
              <div className="info-row">
                <span className="label">Business Line:</span>
                <span className="value">{schedule.metadata.business_line || 'Unknown'}</span>
              </div>
              
              <div className="info-row">
                <span className="label">Month:</span>
                <span className="value">{schedule.metadata.census_month || 'Unknown'}</span>
              </div>
              
              <div className="info-row">
                <span className="label">Patients Served:</span>
                <span className="value">{schedule.metadata.total_patients_served || 0}</span>
              </div>
              
              <div className="info-row">
                <span className="label">Travel Time:</span>
                <span className="value">{(schedule.metadata.total_travel_time || 0).toFixed(1)}h</span>
              </div>
            </div>
            
            <div className="schedule-meta">
              <div className="file-info">
                <span>{formatFileSize(schedule.size)}</span>
                <span className="separator">•</span>
                <span>{formatDate(schedule.modified)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Hover tooltip */}
      {hoveredSchedule && (
        <div
          className="schedule-tooltip"
          style={{
            left: mousePosition.x + 10,
            top: mousePosition.y - 10,
          }}
        >
          <div className="tooltip-header">Configuration Details</div>
          <div className="tooltip-content">
            <div className="tooltip-row">
              <span className="tooltip-label">Business Line:</span>
              <span className="tooltip-value">{hoveredSchedule.metadata.business_line || 'Unknown'}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Census Month:</span>
              <span className="tooltip-value">{hoveredSchedule.metadata.census_month || 'Unknown'}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Optimization Mode:</span>
              <span className="tooltip-value">{hoveredSchedule.metadata.optimization_mode || 'Unknown'}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Max Patients/Day:</span>
              <span className="tooltip-value">{hoveredSchedule.metadata.max_patients_per_day || 'Unknown'}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Providers:</span>
              <span className="tooltip-value">{hoveredSchedule.metadata.providers || 0}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Facilities:</span>
              <span className="tooltip-value">{hoveredSchedule.metadata.facilities || 0}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Utilization:</span>
              <span className="tooltip-value">{(hoveredSchedule.metadata.overall_utilization || 0).toFixed(1)}%</span>
            </div>
            {hoveredSchedule.metadata.saved_at && (
              <div className="tooltip-row">
                <span className="tooltip-label">Saved:</span>
                <span className="tooltip-value">{new Date(hoveredSchedule.metadata.saved_at).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ScheduleBrowser;