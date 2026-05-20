import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { SensorReading, Vehicle } from '../data/dummyData';
import './Map.css';

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface MapProps {
  sensorReadings: SensorReading[];
  vehicles: Vehicle[];
}

// Helper function to encode SVG to base64 data URL
const encodeSvgToDataUrl = (svg: string): string => {
  const encoded = encodeURIComponent(svg);
  return `data:image/svg+xml,${encoded}`;
};

const MapComponent: React.FC<MapProps> = ({ sensorReadings, vehicles }) => {
  const lasPinasCenter: [number, number] = [14.3534, 120.9895];

  const getColorByPM25 = (pm25: number | undefined): string => {
    const value = pm25 || 0;
    if (value <= 35) return '#00ff00'; // Good - Green
    if (value <= 75) return '#ffff00'; // Moderate - Yellow
    if (value <= 115) return '#ff7700'; // Unhealthy for sensitive - Orange
    return '#ff0000'; // Unhealthy - Red
  };

  const getVehicleColor = (type: string): string => {
    switch (type) {
      case 'car':
        return '#0066cc';
      case 'truck':
        return '#ff6600';
      case 'motorcycle':
        return '#00cc00';
      case 'bus':
        return '#9900cc';
      default:
        return '#666666';
    }
  };

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

  return (
    <div className="map-container">
      <MapContainer center={lasPinasCenter} zoom={14} scrollWheelZoom={false} style={{ height: '100%', width: '100%', background: '#e0e0e0' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          crossOrigin=""
        />

        {/* Sensor Reading Markers */}
        {sensorReadings
          .filter(reading => reading.location && reading.location.lat && reading.location.lng)
          .map((reading) => (
          <CircleMarker
            key={reading.id}
            center={[reading.location.lat, reading.location.lng]}
            radius={15}
            fillColor={getColorByPM25(reading.pm25)}
            fillOpacity={0.7}
            weight={2}
            color={getColorByPM25(reading.pm25)}
          >
            <Popup>
              <div className="popup-content">
                <h4>{reading.location.name}</h4>
                <p className="popup-pm25">
                  <strong>PM2.5:</strong> {reading.pm25} μg/m³
                </p>
                <p>
                  <strong>Status:</strong> {reading.status.replace('_', ' ')}
                </p>
                <p className="popup-time">
                  {formatTimestamp(reading.timestamp)}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Vehicle Detection Markers */}
        {vehicles
          .filter(vehicle => vehicle.location && vehicle.location.lat && vehicle.location.lng)
          .map((vehicle) => {
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
            <circle cx="15" cy="15" r="12" fill="${getVehicleColor(vehicle.type)}" stroke="white" stroke-width="2"/>
            <text x="15" y="20" text-anchor="middle" fill="white" font-size="12" font-weight="bold">
              ${vehicle.type.charAt(0).toUpperCase()}
            </text>
          </svg>`;

          return (
            <Marker
              key={vehicle.id}
              position={[vehicle.location.lat, vehicle.location.lng]}
              icon={L.icon({
                iconUrl: encodeSvgToDataUrl(svg),
                iconSize: [30, 30],
                iconAnchor: [15, 15],
              })}
            >
              <Popup>
                <div className="popup-content">
                  <p>
                    <strong>Type:</strong> {vehicle.type}
                  </p>
                  <p>
                    <strong>Confidence:</strong> {(vehicle.confidence * 100).toFixed(1)}%
                  </p>
                  <p className="popup-time">
                    Detected: {formatTimestamp(vehicle.detectedAt)}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default MapComponent;
