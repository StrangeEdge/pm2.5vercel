import { useState, useEffect, useRef } from 'react';
import type { SensorReading, Vehicle } from '../data/dummyData';
import StatsHeader from './StatsHeader';
import MapComponent from './Map';
import LeftSidebar from './LeftSidebar';
import RightSidebar from './RightSidebar';
import { getRealtimeData } from '../utils/realtimeDatabaseHelpers';
import './Dashboard.css';

const STALE_DATA_MS = 5 * 60 * 1000; // 5 minutes

const Dashboard: React.FC = () => {
  const [sensorReadings, setSensorReadings] = useState<SensorReading[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState<SensorReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const applyData = (data: { sensorReadings: SensorReading[]; vehicles: Vehicle[] }) => {
    setSensorReadings(data.sensorReadings);
    setVehicles(data.vehicles);

    setSelectedSensor(prev => {
      if (data.sensorReadings.length === 0) return null;
      if (!prev) return data.sensorReadings[0];
      const updated = data.sensorReadings.find(r => r.id === prev.id);
      return updated ?? data.sensorReadings[0];
    });

    if (data.sensorReadings.length > 0) {
      const latest = data.sensorReadings.reduce((a, b) =>
        a.timestamp > b.timestamp ? a : b
      );
      setIsStale(Date.now() - latest.timestamp.getTime() > STALE_DATA_MS);
    } else {
      setIsStale(true);
    }

    setError(null);
    setIsLive(true);
  };

  // Single effect: initial fetch + polling interval.
  // setState calls happen only in .then() callbacks, never synchronously in the effect body.
  useEffect(() => {
    if (isPaused) return;

    mountedRef.current = true;

    const refresh = () => {
      getRealtimeData()
        .then(data => { if (mountedRef.current) applyData(data); })
        .catch(() => { if (mountedRef.current) { setError('Failed to connect to Firebase'); setIsLive(false); } })
        .finally(() => { if (mountedRef.current) setLoading(false); });
    };

    refresh();
    const interval = setInterval(refresh, 3000);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [isPaused]);

  const handleTogglePause = () => {
    setIsPaused(prev => !prev);
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
      {isStale && (
        <div className="stale-banner">
          ⚠️ Data is stale — no recent readings from sensors. Last reading was over 5 minutes ago.
        </div>
      )}

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
