import { useState, useEffect } from 'react';
import type { SensorReading, Vehicle } from '../data/dummyData';
import StatsHeader from './StatsHeader';
import MapComponent from './Map';
import LeftSidebar from './LeftSidebar';
import RightSidebar from './RightSidebar';
import { getRealtimeData, subscribeToRealtimeData } from '../utils/realtimeDatabaseHelpers';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const [sensorReadings, setSensorReadings] = useState<SensorReading[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState<SensorReading | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Set up real-time data subscription
  useEffect(() => {
    if (isPaused) {
      setLoading(false);
      return;
    }

    // Initial fetch
    const initialFetch = async () => {
      try {
        const data = await getRealtimeData();
        setSensorReadings(data.sensorReadings);
        setVehicles(data.vehicles);
        setError(null);
        setIsLive(true);
      } catch (err) {
        console.error('Error fetching initial data:', err);
        setError('Failed to connect to Firebase');
        setIsLive(false);
      } finally {
        setLoading(false);
      }
    };

    initialFetch();

    // Subscribe to real-time updates
    const unsubscribe = subscribeToRealtimeData((data) => {
      setSensorReadings(data.sensorReadings);
      setVehicles(data.vehicles);
      setIsLive(true);
      setError(null);
    });

    return () => {
      unsubscribe();
    };
  }, [isPaused]);

  // Auto-select first sensor when data loads
  useEffect(() => {
    if (sensorReadings.length > 0 && !selectedSensor) {
      setSelectedSensor(sensorReadings[0]);
    }
  }, [sensorReadings, selectedSensor]);

  // Keep selected sensor in sync with live updates
  useEffect(() => {
    if (!selectedSensor) return;

    const updatedSensor = sensorReadings.find((reading) => reading.id === selectedSensor.id);
    if (updatedSensor && updatedSensor !== selectedSensor) {
      setSelectedSensor(updatedSensor);
    }
  }, [sensorReadings, selectedSensor]);

  const handleTogglePause = () => {
    setIsPaused(!isPaused);
  };

  const handleSelectSensor = (sensor: SensorReading) => {
    setSelectedSensor(sensor);
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>Loading data from Firebase Realtime Database...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-loading">
        <div className="error-icon">⚠️</div>
        <p>Error: {error}</p>
        <p style={{ fontSize: '12px', marginTop: '10px' }}>
          Make sure Firebase Realtime Database is properly configured.
        </p>
      </div>
    );
  }

  if (sensorReadings.length === 0 && vehicles.length === 0) {
    return (
      <div className="dashboard-loading">
        <div className="info-icon">ℹ️</div>
        <p>No data available from Firebase</p>
        <p style={{ fontSize: '12px', marginTop: '10px' }}>
          Make sure data exists in your Realtime Database at path: /pm25_data
        </p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <StatsHeader
        sensorReadings={sensorReadings}
        activeNodes={sensorReadings.length}
        isLive={isLive}
        isPaused={isPaused}
        onTogglePause={handleTogglePause}
      />

      <div className="dashboard-content">
        <div className="left-panel">
          <LeftSidebar
            sensorReadings={sensorReadings}
            selectedSensor={selectedSensor}
            onSelectSensor={handleSelectSensor}
          />
        </div>

        <div className="center-panel">
          {sensorReadings.length > 0 || vehicles.length > 0 ? (
            <MapComponent
              sensorReadings={sensorReadings}
              selectedSensor={selectedSensor}
            />
          ) : (
            <div className="no-data-map">
              <p>No data available</p>
            </div>
          )}
        </div>

        <div className="right-panel">
          <RightSidebar
            sensorReadings={sensorReadings}
            vehicles={vehicles}
            selectedSensor={selectedSensor}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
