import type { SensorReading } from '../data/dummyData';
import './StatsHeader.css';

interface StatsHeaderProps {
  sensorReadings: SensorReading[];
  activeNodes: number;
  isLive: boolean;
  isPaused: boolean;
  onTogglePause: () => void;
}

const StatsHeader: React.FC<StatsHeaderProps> = ({
  sensorReadings,
  activeNodes,
  isLive,
  isPaused,
  onTogglePause,
}) => {
  const calculateStats = () => {
    if (sensorReadings.length === 0) {
      return { avg: 0, peak: 0, min: 0 };
    }

    const values = sensorReadings.map(r => r.pm25);
    const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    const peak = Math.max(...values);
    const min = Math.min(...values);

    return { avg, peak, min };
  };

  const getStatusColor = (value: number): string => {
    if (value <= 35) return '#21db15'; // Good - Green
    if (value <= 75) return '#ffd700'; // Moderate - Yellow
    if (value <= 115) return '#ffa500'; // Unhealthy for sensitive - Orange
    return '#ff3333'; // Unhealthy - Red
  };

  const { avg, peak, min } = calculateStats();

  return (
    <header className="stats-header">
      <div className="header-left">
        <div className="logo-section">
          <h1 className="app-title">AirScan Monitor</h1>
          <span className="subtitle">PM2.5 - VEHICLE DETECTION - FIELD UNITS</span>
        </div>
      </div>

      <div className="header-center">
        <div className="stat-item">
          <span className="stat-label">AVE PM2.5</span>
          <span className="stat-value" style={{ color: getStatusColor(avg) }}>
            {avg}
          </span>
          <span className="stat-unit">μg/m³</span>
        </div>

        <div className="stat-item">
          <span className="stat-label">PEAK PM2.5</span>
          <span className="stat-value" style={{ color: getStatusColor(peak) }}>
            {peak}
          </span>
          <span className="stat-unit">μg/m³</span>
        </div>

        <div className="stat-item">
          <span className="stat-label">MIN PM2.5</span>
          <span className="stat-value" style={{ color: getStatusColor(min) }}>
            {min}
          </span>
          <span className="stat-unit">μg/m³</span>
        </div>

        <div className="stat-item">
          <span className="stat-label">HOTSPOTS</span>
          <span className="stat-value" style={{ color: '#00d9ff' }}>
            {activeNodes}
          </span>
          <span className="stat-unit">active nodes</span>
        </div>
      </div>

      <div className="header-right">
        <div className={`live-indicator ${isLive ? 'active' : ''}`}>
          <span className="live-dot"></span>
          <span className="live-text">
            {isLive ? (isPaused ? 'PAUSED' : 'LIVE') : 'OFFLINE'}
          </span>
        </div>
        <button className="pause-btn" onClick={onTogglePause} title={isPaused ? 'Resume' : 'Pause'}>
          {isPaused ? '▶' : '⏸'}
        </button>
      </div>
    </header>
  );
};

export default StatsHeader;
