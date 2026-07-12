import { useState, useEffect, useRef } from 'react';
import type { SensorReading } from '../data/dummyData';
import StatsHeader from './StatsHeader';
import MapComponent from './Map';
import LeftSidebar from './LeftSidebar';
import RightSidebar from './RightSidebar';
import { getRealtimeData } from '../utils/realtimeDatabaseHelpers';
import './Dashboard.css';

const STALE_DATA_MS = 5 * 60 * 1000; // 5 minutes
export const SENSOR_OFFLINE_MS = STALE_DATA_MS;

const Dashboard: React.FC = () => {
  const [sensorReadings, setSensorReadings] = useState<SensorReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState<SensorReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offlineSensorIds, setOfflineSensorIds] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const fetchingRef = useRef(false);

  const applyData = (data: { sensorReadings: SensorReading[] }) => {
    setSensorReadings(data.sensorReadings);

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
      const now = Date.now();
      setIsStale(now - latest.timestamp.getTime() > STALE_DATA_MS);

      const offline = new Set<string>();
      data.sensorReadings.forEach(r => {
        if (now - r.timestamp.getTime() > SENSOR_OFFLINE_MS) {
          offline.add(r.id);
        }
      });
      setOfflineSensorIds(offline);
    } else {
      setIsStale(true);
      setOfflineSensorIds(new Set());
    }

    setError(null);
    setIsLive(true);
  };

  useEffect(() => {
    if (isPaused) return;

    mountedRef.current = true;

    const refresh = () => {
      if (fetchingRef.current) return; // skip if previous request still in flight
      fetchingRef.current = true;

      getRealtimeData()
        .then(data => { if (mountedRef.current) applyData(data); })
        .catch(() => { if (mountedRef.current) { setError('Failed to connect to Firebase'); setIsLive(false); } })
        .finally(() => {
          if (mountedRef.current) { setLoading(false); fetchingRef.current = false; }
        });
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
        <p>Error: {error}</p>
        <p style={{ fontSize: '12px', marginTop: '10px' }}>
          Make sure Firebase Realtime Database is properly configured.
        </p>
      </div>
    );
  }

  if (sensorReadings.length === 0) {
    return (
      <div className="dashboard-loading">
        <p>No data available from Firebase</p>
        <p style={{ fontSize: '12px', marginTop: '10px' }}>
          Make sure data exists in your Realtime Database at path: /pm25_data
        </p>
      </div>
    );
  }

  const activeCount = sensorReadings.filter(r => !offlineSensorIds.has(r.id)).length;

  return (
    <div className="dashboard">
      {isStale && (
        <div className="stale-banner">
          No recent readings from sensors. Last reading was over 5 minutes ago.
        </div>
      )}

      <StatsHeader
        sensorReadings={sensorReadings}
        activeNodes={activeCount}
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
            offlineSensorIds={offlineSensorIds}
          />
        </div>

        <div className="center-panel">
          <MapComponent
            sensorReadings={sensorReadings}
            selectedSensor={selectedSensor}
            offlineSensorIds={offlineSensorIds}
          />
        </div>

        <div className="right-panel">
          <RightSidebar
            sensorReadings={sensorReadings}
            selectedSensor={selectedSensor}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
