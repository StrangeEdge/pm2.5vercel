import { useState, useEffect } from 'react';
import type { SensorReading, Vehicle } from '../data/dummyData';
import MapComponent from './Map';
import ReadingsPanel from './ReadingsPanel';
import { getDataForDay, getDataForLastHours } from '../utils/firebaseDataHelpers';
import './Dashboard.css';

interface DateTimeFilter {
  mode: 'today' | 'yesterday' | 'last7days' | 'custom';
  customDate?: Date;
  startDate?: Date;
  endDate?: Date;
}

const Dashboard: React.FC = () => {
  const [sensorReadings, setSensorReadings] = useState<SensorReading[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateTimeFilter>({ mode: 'today' });

  // Fetch data based on date filter
  const fetchDataByFilter = async (filter: DateTimeFilter) => {
    try {
      setLoading(true);
      setError(null);
      let readings: SensorReading[] = [];
      let vehiclesList: Vehicle[] = [];

      switch (filter.mode) {
        case 'today': {
          const today = new Date();
          const result = await getDataForDay(today);
          readings = result.readings as SensorReading[];
          vehiclesList = result.vehicles as Vehicle[];
          break;
        }
        case 'yesterday': {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const result = await getDataForDay(yesterday);
          readings = result.readings as SensorReading[];
          vehiclesList = result.vehicles as Vehicle[];
          break;
        }
        case 'last7days': {
          const result = await getDataForLastHours(7 * 24);
          readings = result.readings as SensorReading[];
          vehiclesList = result.vehicles as Vehicle[];
          break;
        }
        case 'custom': {
          if (filter.customDate) {
            const result = await getDataForDay(filter.customDate);
            readings = result.readings as SensorReading[];
            vehiclesList = result.vehicles as Vehicle[];
          }
          break;
        }
      }

      setSensorReadings(readings);
      setVehicles(vehiclesList);

      if (readings.length === 0 && vehiclesList.length === 0) {
        setError('No data available for the selected date range');
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to fetch data from Firebase. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when filter changes
  useEffect(() => {
    fetchDataByFilter(dateFilter);
  }, [dateFilter]);

  const handleDateFilterChange = (mode: DateTimeFilter['mode']) => {
    setDateFilter({ mode });
  };

  const handleCustomDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = new Date(e.target.value);
    setDateFilter({ mode: 'custom', customDate: date });
  };

  const getSelectedDateDisplay = (): string => {
    switch (dateFilter.mode) {
      case 'today':
        return 'Today';
      case 'yesterday':
        return 'Yesterday';
      case 'last7days':
        return 'Last 7 Days';
      case 'custom':
        return dateFilter.customDate
          ? dateFilter.customDate.toLocaleDateString()
          : 'Select Date';
      default:
        return 'Today';
    }
  };

  if (loading && sensorReadings.length === 0) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>Loading data from Firebase...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Date/Time Filter Controls */}
      <div className="filter-header">
        <div className="filter-controls">
          <div className="filter-label">View Data:</div>
          <button
            className={`filter-btn ${dateFilter.mode === 'today' ? 'active' : ''}`}
            onClick={() => handleDateFilterChange('today')}
          >
            Today
          </button>
          <button
            className={`filter-btn ${dateFilter.mode === 'yesterday' ? 'active' : ''}`}
            onClick={() => handleDateFilterChange('yesterday')}
          >
            Yesterday
          </button>
          <button
            className={`filter-btn ${dateFilter.mode === 'last7days' ? 'active' : ''}`}
            onClick={() => handleDateFilterChange('last7days')}
          >
            Last 7 Days
          </button>
          <div className="filter-custom">
            <label htmlFor="custom-date">Custom Date:</label>
            <input
              id="custom-date"
              type="date"
              onChange={handleCustomDateChange}
              defaultValue={new Date().toISOString().split('T')[0]}
              onClick={() => setDateFilter({ mode: 'custom' })}
            />
          </div>
        </div>
        <div className="filter-info">
          <span className="current-selection">📅 {getSelectedDateDisplay()}</span>
          <span className="data-count">
            📊 {sensorReadings.length} readings • 🚗 {vehicles.length} vehicles
          </span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
        </div>
      )}

      {/* Main Dashboard */}
      <div className="dashboard-content">
        <div className="map-section">
          {sensorReadings.length > 0 || vehicles.length > 0 ? (
            <MapComponent sensorReadings={sensorReadings} vehicles={vehicles} />
          ) : (
            <div className="no-data-map">
              <p>No data available for this date range</p>
            </div>
          )}
        </div>
        <div className="readings-section">
          <ReadingsPanel sensorReadings={sensorReadings} vehicles={vehicles} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
