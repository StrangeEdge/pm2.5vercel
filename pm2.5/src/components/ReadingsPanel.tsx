import type { SensorReading, Vehicle } from '../data/dummyData';
import './ReadingsPanel.css';

interface ReadingsPanelProps {
  sensorReadings: SensorReading[];
  vehicles: Vehicle[];
}

const ReadingsPanel: React.FC<ReadingsPanelProps> = ({ sensorReadings, vehicles }) => {
  const formatTimestamp = (timestamp: any): string => {
    // Handle Firestore Timestamp objects
    if (timestamp && typeof timestamp.toDate === 'function') {
      return timestamp.toDate().toLocaleTimeString();
    }
    // Handle JavaScript Date objects
    if (timestamp instanceof Date) {
      return timestamp.toLocaleTimeString();
    }
    return 'N/A';
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'good':
        return '#00ff00';
      case 'moderate':
        return '#ffff00';
      case 'unhealthy_for_sensitive':
        return '#ff7700';
      case 'unhealthy':
        return '#ff0000';
      default:
        return '#666666';
    }
  };

  const getAveragePM25 = (): number => {
    if (sensorReadings.length === 0) return 0;
    const sum = sensorReadings.reduce((acc, reading) => acc + reading.pm25, 0);
    return Math.round(sum / sensorReadings.length);
  };

  const getStatusLabel = (pm25: number): string => {
    if (pm25 <= 35) return 'Good';
    if (pm25 <= 75) return 'Moderate';
    if (pm25 <= 115) return 'Unhealthy for Sensitive Groups';
    return 'Unhealthy';
  };

  const getVehicleSvgIcon = (type: string): React.ReactNode => {
    const typeColors: { [key: string]: string } = {
      car: '#3b82f6',
      truck: '#ef4444',
      motorcycle: '#f59e0b',
      bus: '#8b5cf6',
      default: '#6b7280'
    };
    
    const color = typeColors[type] || typeColors['default'];
    
    const svgs: { [key: string]: string } = {
      car: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="${color}"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm11 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM5 11l1.5-4.5h11L19 11H5z"/></svg>`,
      truck: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="${color}"><path d="M17 10h-4V8h4m1-3h-4c-1.1 0-2 .9-2 2v3H3c-1.1 0-2 .9-2 2v6h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4m-6 10c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zM5 19c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>`,
      motorcycle: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="${color}"><circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M14 5h4v2h-4zM9 5h4v2H9zm4 5h6v-2h-6zm4.5 2h-3.5v2H21v-4h-3.5z"/></svg>`,
      bus: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="${color}"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM6 16c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm12 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>`
    };
    
    return <div dangerouslySetInnerHTML={{ __html: svgs[type] || svgs['car'] }} />;
  };

  const averagePM25 = getAveragePM25();

  return (
    <div className="readings-panel">
      <div className="panel-header">
        <h1>Dashboard - Las Piñas</h1>
        <p className="last-updated">Last updated: {new Date().toLocaleTimeString()}</p>
      </div>

      <div className="summary-section">
        <div className="summary-card">
          <h3>Average PM2.5</h3>
          <div
            className="pm25-value"
            style={{ color: getStatusColor(getStatusLabel(averagePM25).toLowerCase().replace(/ /g, '_')) }}
          >
            {averagePM25}
          </div>
          <p className="pm25-unit">μg/m³</p>
          <p className="status-label">{getStatusLabel(averagePM25)}</p>
        </div>

        <div className="summary-card">
          <h3>Vehicles Detected</h3>
          <div className="vehicle-count">{vehicles.length}</div>
          <p className="vehicle-period">in last 30 min</p>
        </div>
      </div>

      {/* Sensor Readings Section */}
      <div className="section">
        <h2>Sensor Readings</h2>
        <div className="readings-list">
          {sensorReadings.map((reading) => (
            <div key={reading.id} className="reading-item">
              <div className="reading-location">
                <h4>{reading.location.name}</h4>
                <p className="reading-time">{formatTimestamp(reading.timestamp)}</p>
              </div>
              <div
                className="reading-value"
                style={{ borderColor: getStatusColor(reading.status) }}
              >
                <span className="pm25-number">{reading.pm25}</span>
                <span className="unit">μg/m³</span>
              </div>
              <div
                className="status-badge"
                style={{ backgroundColor: getStatusColor(reading.status) }}
              ></div>
            </div>
          ))}
        </div>
      </div>

      {/* Vehicles Section */}
      <div className="section">
        <h2>Detected Vehicles</h2>
        <div className="vehicles-list">
          {vehicles.map((vehicle) => (
            <div key={vehicle.id} className="vehicle-item">
              <div className="vehicle-type">
                <span className="vehicle-svg-icon">{getVehicleSvgIcon(vehicle.type)}</span>
                <div className="vehicle-info">
                  <h4>{vehicle.type.charAt(0).toUpperCase() + vehicle.type.slice(1)}</h4>
                  <p>{formatTimestamp(vehicle.detectedAt)}</p>
                </div>
              </div>
              <div className="confidence-bar">
                <div
                  className="confidence-fill"
                  style={{ width: `${vehicle.confidence * 100}%` }}
                ></div>
              </div>
              <span className="confidence-text">{(vehicle.confidence * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Legend Section */}
      <div className="legend-section">
        <h3>PM2.5 Status Legend</h3>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#00ff00' }}></div>
            <span>Good (0-35)</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#ffff00' }}></div>
            <span>Moderate (36-75)</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#ff7700' }}></div>
            <span>Unhealthy Sensitive (76-115)</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#ff0000' }}></div>
            <span>Unhealthy (116+)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReadingsPanel;
