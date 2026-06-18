import { useState, useEffect } from 'react';
import type { SensorReading, Vehicle } from '../data/dummyData';
import { generateDummyData } from '../data/dummyData';
import StatsHeader from './StatsHeader';
import MapComponent from './Map';
import LeftSidebar from './LeftSidebar';
import RightSidebar from './RightSidebar';
import { getDataForDay } from '../utils/firebaseDataHelpers';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const [sensorReadings, setSensorReadings] = useState<SensorReading[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState<SensorReading | null>(null);

  // Real-time polling effect
  useEffect(() => {
    if (isPaused) return;

    const fetchLatestData = async () => {
      try {
        const today = new Date();
        const result = await getDataForDay(today);
        const readings = result.readings as SensorReading[];
        const vehiclesList = result.vehicles as Vehicle[];

        // Use dummy data if Firebase returns no results (development fallback)
        if (readings.length === 0 && vehiclesList.length === 0) {
          const dummyData = generateDummyData();
          setSensorReadings(dummyData.sensorReadings);
          setVehicles(dummyData.vehicles);
        } else {
          setSensorReadings(readings);
          setVehicles(vehiclesList);
        }

        setIsLive(true);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching real-time data:', err);
        // Fallback to dummy data on error
        const dummyData = generateDummyData();
        setSensorReadings(dummyData.sensorReadings);
        setVehicles(dummyData.vehicles);
        setIsLive(false);
        setLoading(false);
      }
    };

    // Initial fetch
    fetchLatestData();

    // Set up polling every 3 seconds
    const pollInterval = setInterval(fetchLatestData, 3000);

    return () => clearInterval(pollInterval);
  }, [isPaused]);

  // Auto-select first sensor when data loads
  useEffect(() => {
    if (sensorReadings.length > 0 && !selectedSensor) {
      setSelectedSensor(sensorReadings[0]);
    }
  }, [sensorReadings, selectedSensor]);

  const handleTogglePause = () => {
    setIsPaused(!isPaused);
  };

  const handleSelectSensor = (sensor: SensorReading) => {
    setSelectedSensor(sensor);
  };

  if (loading && sensorReadings.length === 0) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>Loading live data from Firebase...</p>
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
            <MapComponent sensorReadings={sensorReadings} vehicles={vehicles} />
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
