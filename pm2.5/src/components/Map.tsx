import { useEffect } from 'react';
import { MapContainer, TileLayer, Popup, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { SensorReading, VehicleCounts } from '../data/dummyData';
import { VEHICLE_TYPES, totalVehicleCount } from '../data/dummyData';
import './Map.css';

interface MapProps {
  sensorReadings: SensorReading[];
  selectedSensor: SensorReading | null;
}

const getStatusColor = (status: SensorReading['status']): string => {
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

const MapFlyTo: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();

  useEffect(() => {
    map.flyTo(center, zoom, { duration: 0.8 });
  }, [map, center, zoom]);

  return null;
};

const MapComponent: React.FC<MapProps> = ({ sensorReadings, selectedSensor }) => {
  const lasPinasCenter: [number, number] = [14.3534, 120.9895];
  const mapCenter: [number, number] = selectedSensor
    ? [selectedSensor.location.lat, selectedSensor.location.lng]
    : lasPinasCenter;

  const validReadings = sensorReadings.filter(
    (reading) => reading.location?.lat != null && reading.location?.lng != null
  );

  // Render selected marker last so it appears on top when sensors share coordinates
  const sortedReadings = [...validReadings].sort((a, b) => {
    if (selectedSensor?.id === a.id) return 1;
    if (selectedSensor?.id === b.id) return -1;
    return 0;
  });

  const formatVehicleSummary = (vehicles: VehicleCounts): string => {
    const parts = VEHICLE_TYPES
      .map((type) => {
        const count = vehicles[type] || 0;
        return count > 0 ? `${type}: ${count}` : null;
      })
      .filter(Boolean);

    return parts.length > 0 ? parts.join(', ') : 'No vehicles detected';
  };

  const formatTimestamp = (timestamp: Date | { toDate: () => Date }): string => {
    // Handle Firestore Timestamp objects
    if (timestamp && 'toDate' in timestamp && typeof timestamp.toDate === 'function') {
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
      <MapContainer center={lasPinasCenter} zoom={14} scrollWheelZoom={false} className="dark-map" style={{ height: '100%', width: '100%' }}>
        {selectedSensor && (
          <MapFlyTo center={mapCenter} zoom={15} />
        )}

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains={['a', 'b', 'c', 'd']}
          crossOrigin=""
        />

        {/* Sensor Reading Markers */}
        {sortedReadings.map((reading) => {
          const isSelected = selectedSensor?.id === reading.id;
          const markerColor = getStatusColor(reading.status);

          return (
          <CircleMarker
            key={`${reading.id}-${reading.pm25}-${reading.status}`}
            center={[reading.location.lat, reading.location.lng]}
            radius={isSelected ? 18 : 12}
            fillColor={markerColor}
            fillOpacity={isSelected ? 0.9 : 0.55}
            weight={isSelected ? 3 : 2}
            color={isSelected ? '#1a1a2e' : markerColor}
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
                <p>
                  <strong>Vehicles:</strong> {totalVehicleCount(reading.vehicles)}
                </p>
                <p className="popup-vehicles">{formatVehicleSummary(reading.vehicles)}</p>
                <p className="popup-time">
                  {formatTimestamp(reading.timestamp)}
                </p>
              </div>
            </Popup>
          </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default MapComponent;
