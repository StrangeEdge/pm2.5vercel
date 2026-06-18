import type { SensorReading } from '../data/dummyData';
import './LeftSidebar.css';

interface LeftSidebarProps {
  sensorReadings: SensorReading[];
  selectedSensor: SensorReading | null;
  onSelectSensor: (sensor: SensorReading) => void;
}

const LeftSidebar: React.FC<LeftSidebarProps> = ({
  sensorReadings,
  selectedSensor,
  onSelectSensor,
}) => {
  const formatTimestamp = (timestamp: any): string => {
    if (timestamp && typeof timestamp.toDate === 'function') {
      const date = timestamp.toDate();
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (timestamp instanceof Date) {
      return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return 'N/A';
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'good':
        return '#21db15';
      case 'moderate':
        return '#ffd700';
      case 'unhealthy_for_sensitive':
        return '#ffa500';
      case 'unhealthy':
        return '#ff3333';
      default:
        return '#8892a0';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'good':
        return 'Good';
      case 'moderate':
        return 'Moderate';
      case 'unhealthy_for_sensitive':
        return 'Unhealthy Sensitive';
      case 'unhealthy':
        return 'Unhealthy';
      default:
        return 'Unknown';
    }
  };

  return (
    <aside className="left-sidebar">
      <div className="sidebar-header">
        <h2>FIELD UNITS</h2>
        <span className="field-count">
          {sensorReadings.length} ONLINE
        </span>
      </div>

      <div className="sensor-list">
        {sensorReadings.map((reading) => (
          <div
            key={reading.id}
            className={`sensor-item ${selectedSensor?.id === reading.id ? 'selected' : ''}`}
            onClick={() => onSelectSensor(reading)}
          >
            <div className="sensor-header">
              <h3 className="sensor-name">{reading.location.name}</h3>
              <span className="sensor-time">{formatTimestamp(reading.timestamp)}</span>
            </div>

            <div className="sensor-value-row">
              <div className="pm25-display">
                <span className="pm25-large" style={{ color: getStatusColor(reading.status) }}>
                  {reading.pm25}
                </span>
                <span className="pm25-unit">μg/m³</span>
              </div>

              <div
                className="status-badge"
                style={{
                  backgroundColor: getStatusColor(reading.status),
                  color: reading.status === 'moderate' ? '#000' : '#fff',
                }}
              >
                {getStatusLabel(reading.status)}
              </div>
            </div>

            <div className="sensor-footer">
              <span className="live-indicator-small">● LIVE</span>
            </div>
          </div>
        ))}

        {sensorReadings.length === 0 && (
          <div className="no-sensors">
            <p>No sensor data available</p>
          </div>
        )}
      </div>
    </aside>
  );
};

export default LeftSidebar;
