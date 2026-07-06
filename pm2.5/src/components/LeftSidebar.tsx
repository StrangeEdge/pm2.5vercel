import type { SensorReading } from '../data/dummyData';
import './LeftSidebar.css';

interface LeftSidebarProps {
  sensorReadings: SensorReading[];
  selectedSensor: SensorReading | null;
  onSelectSensor: (sensor: SensorReading) => void;
  offlineSensorIds: Set<string>;
}

const LeftSidebar: React.FC<LeftSidebarProps> = ({
  sensorReadings,
  selectedSensor,
  onSelectSensor,
  offlineSensorIds,
}) => {
  const formatTimestamp = (timestamp: unknown): string => {
    let date: Date | null = null;

    if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp && typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      date = timestamp;
    }

    if (!date) return 'N/A';

    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
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
        return 'GOOD';
      case 'moderate':
        return 'MODERATE';
      case 'unhealthy_for_sensitive':
        return 'UNHEALTHY*';
      case 'unhealthy':
        return 'UNHEALTHY';
      default:
        return 'UNKNOWN';
    }
  };

  return (
    <aside className="left-sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">FIELD UNITS</span>
        <span className="sidebar-divider">·</span>
        <span className="field-count">{sensorReadings.filter(r => !offlineSensorIds.has(r.id)).length} ONLINE</span>
      </div>

      <div className="sensor-list">
        {sensorReadings.map((reading) => {
          const statusColor = getStatusColor(reading.status);
          const isOffline = offlineSensorIds.has(reading.id);

          return (
            <div
              key={reading.id}
              className={`sensor-item ${selectedSensor?.id === reading.id ? 'selected' : ''} ${isOffline ? 'offline' : ''}`}
              onClick={() => onSelectSensor(reading)}
            >
              <div className="sensor-card-grid">
                <h3 className="sensor-name">{reading.location.name}</h3>
                <div className="pm25-value" style={{ color: isOffline ? '#555' : statusColor }}>
                  {Number(reading.pm25).toFixed(1)}
                </div>

                {isOffline ? (
                  <div className="offline-badge">OFFLINE</div>
                ) : (
                  <div
                    className="status-badge"
                    style={{
                      color: statusColor,
                      borderColor: statusColor,
                    }}
                  >
                    {getStatusLabel(reading.status)}
                  </div>
                )}
                <span className="pm25-unit">µg/m³</span>

                <span className="sensor-time">{formatTimestamp(reading.timestamp)}</span>
              </div>
            </div>
          );
        })}

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
