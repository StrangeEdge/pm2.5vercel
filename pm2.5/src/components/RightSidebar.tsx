import type { SensorReading, VehicleCounts } from '../data/dummyData';
import {
  VEHICLE_TYPES,
  totalVehicleCount,
  emptyVehicleCounts,
  getHotspotTierColor,
  getHotspotTierLabel,
  getPM25StatusColor,
  getPM25StatusLabel,
  isHotspotTierFlagged,
} from '../data/dummyData';
import './RightSidebar.css';

interface RightSidebarProps {
  sensorReadings: SensorReading[];
  selectedSensor: SensorReading | null;
}

const VEHICLE_DISPLAY = [
  {
    name: 'Car',
    key: 'Car' as keyof VehicleCounts,
    icon: '🚗',
    color: '#3b82f6',
  },
  {
    name: 'Jeep',
    key: 'Jeep' as keyof VehicleCounts,
    icon: '🚐',
    color: '#06b6d4',
  },
  {
    name: 'Truck',
    key: 'Truck' as keyof VehicleCounts,
    icon: '🚚',
    color: '#ef4444',
  },
  {
    name: 'Tricycle',
    key: 'Tricycle' as keyof VehicleCounts,
    icon: '🛺',
    color: '#ffa500',
  },
  {
    name: 'Motorcycle',
    key: 'Motorcycle' as keyof VehicleCounts,
    icon: '🏍️',
    color: '#f59e0b',
  },
  {
    name: 'Bus',
    key: 'Bus' as keyof VehicleCounts,
    icon: '🚌',
    color: '#8b5cf6',
  },
];

const RightSidebar: React.FC<RightSidebarProps> = ({
  sensorReadings,
  selectedSensor,
}) => {
  const aqiLevels = [
    { range: '0-9.0', label: 'Good', color: getPM25StatusColor('good') },
    {
      range: '9.1-35.4',
      label: 'Moderate',
      color: getPM25StatusColor('moderate'),
    },
    {
      range: '35.5-55.4',
      label: 'Unhealthy Sensitive',
      color: getPM25StatusColor('unhealthy_for_sensitive'),
    },
    {
      range: '55.5-125.4',
      label: 'Unhealthy',
      color: getPM25StatusColor('unhealthy'),
    },
    {
      range: '125.5-225.4',
      label: 'Very Unhealthy',
      color: getPM25StatusColor('very_unhealthy'),
    },
    {
      range: '225.5+',
      label: 'Hazardous',
      color: getPM25StatusColor('hazardous'),
    },
  ];

  const hotspotLevels = [
    {
      label: 'None',
      range: 'Below sustained threshold',
      color: getHotspotTierColor('none'),
    },
    {
      label: 'Elevated',
      range: 'PM2.5 35.5+ with traffic surge',
      color: getHotspotTierColor('elevated'),
    },
    {
      label: 'Critical Hotspot',
      range: 'PM2.5 55.5+ with traffic surge',
      color: getHotspotTierColor('critical'),
    },
  ];

  const getVehicleCounts = (): VehicleCounts => {
    if (selectedSensor?.vehicles) {
      return selectedSensor.vehicles;
    }

    return sensorReadings.reduce((totals, reading) => {
      VEHICLE_TYPES.forEach((type) => {
        totals[type] += reading.vehicles?.[type] || 0;
      });
      return totals;
    }, emptyVehicleCounts());
  };

  const vehicleCounts = getVehicleCounts();
  const totalVehicles = totalVehicleCount(vehicleCounts);

  const formatTimestamp = (
    timestamp: Date | { toDate: () => Date },
  ): string => {
    if (
      timestamp &&
      'toDate' in timestamp &&
      typeof timestamp.toDate === 'function'
    ) {
      return timestamp
        .toDate()
        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (timestamp instanceof Date) {
      return timestamp.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return 'N/A';
  };

  return (
    <aside className='right-sidebar'>
      {/* Selected Location Section */}
      {selectedSensor && (
        <div className='sidebar-section'>
          <h3 className='section-title'>SELECTED</h3>
          <div className='selected-location'>
            <h4 className='location-name'>{selectedSensor.location.name}</h4>
            <p className='location-coords'>
              {selectedSensor.location.lat.toFixed(4)}°,{' '}
              {selectedSensor.location.lng.toFixed(4)}°
            </p>
            <div className='location-data'>
              <div className='data-row'>
                <span className='data-label'>PM2.5:</span>
                <span className='data-value'>{selectedSensor.pm25} μg/m³</span>
              </div>
              <div className='data-row'>
                <span className='data-label'>Status:</span>
                <span className='data-value'>
                  {getPM25StatusLabel(selectedSensor.status)}
                </span>
              </div>
              <div className='data-row'>
                <span className='data-label'>Hotspot:</span>
                <span
                  className={`data-value ${isHotspotTierFlagged(selectedSensor.hotspotTier) ? 'data-value-hotspot' : ''}`}
                  style={{
                    color: getHotspotTierColor(selectedSensor.hotspotTier),
                  }}
                >
                  {getHotspotTierLabel(selectedSensor.hotspotTier)}
                </span>
              </div>
              <div className='data-row'>
                <span className='data-label'>Vehicles:</span>
                <span className='data-value'>
                  {totalVehicleCount(selectedSensor.vehicles)} detected
                </span>
              </div>
              <div className='data-row'>
                <span className='data-label'>Updated:</span>
                <span className='data-value'>
                  {formatTimestamp(selectedSensor.timestamp)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AQI Scale Section */}
      <div className='sidebar-section'>
        <h3 className='section-title'>AQI SCALE</h3>
        <div className='aqi-scale'>
          {aqiLevels.map((level, idx) => (
            <div key={idx} className='aqi-item'>
              <div
                className='aqi-color-dot'
                style={{ backgroundColor: level.color }}
              ></div>
              <div className='aqi-info'>
                <span className='aqi-label'>{level.label}</span>
                <span className='aqi-range'>{level.range}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hotspot Scale Section */}
      <div className='sidebar-section'>
        <h3 className='section-title'>HOTSPOT SCALE</h3>
        <div className='aqi-scale'>
          {hotspotLevels.map((level, idx) => (
            <div key={idx} className='aqi-item'>
              <div
                className='aqi-color-dot'
                style={{ backgroundColor: level.color }}
              ></div>
              <div className='aqi-info'>
                <span className='aqi-label'>{level.label}</span>
                <span className='aqi-range'>{level.range}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Vehicle Detection Section */}
      <div className='sidebar-section'>
        <h3 className='section-title'>VEHICLE DETECTION</h3>
        <div className='vehicle-stats'>
          <div className='vehicle-total'>
            <span className='total-label'>
              {selectedSensor ? 'At Selected Location' : 'Total Detected'}
            </span>
            <span className='total-count'>{totalVehicles}</span>
          </div>

          <div className='vehicle-breakdown'>
            {VEHICLE_DISPLAY.map((type) => {
              const count = vehicleCounts[type.key] || 0;
              return (
                <div key={type.key} className='vehicle-type-item'>
                  <div className='vehicle-type-header'>
                    <span className='vehicle-type-name'>{type.name}</span>
                    <span className='vehicle-type-count'>{count}</span>
                  </div>
                  <div className='vehicle-progress-bar'>
                    <div
                      className='vehicle-progress-fill'
                      style={{
                        width: `${totalVehicles > 0 ? (count / totalVehicles) * 100 : 0}%`,
                        backgroundColor: type.color,
                      }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default RightSidebar;
