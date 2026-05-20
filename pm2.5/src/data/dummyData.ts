// Las Piñas, Philippines coordinates: ~14.3534° N, 120.9895° E
// Dummy data for PM2.5 sensor readings and vehicle detection

export interface SensorReading {
  id: string;
  pm25: number; // μg/m³
  location: {
    lat: number;
    lng: number;
    name: string;
  };
  timestamp: Date;
  status: 'good' | 'moderate' | 'unhealthy_for_sensitive' | 'unhealthy';
}

export interface Vehicle {
  id: string;
  type: 'car' | 'truck' | 'motorcycle' | 'bus';
  detectedAt: Date;
  location: {
    lat: number;
    lng: number;
  };
  confidence: number; // 0-1
}

export interface DashboardData {
  sensorReadings: SensorReading[];
  vehicles: Vehicle[];
}

// Generate dummy data for Las Piñas area
export const generateDummyData = (): DashboardData => {
  const now = new Date();
  const lasPinasCenter = { lat: 14.3534, lng: 120.9895 };

  // Generate 5 sensor reading locations in Las Piñas
  const sensorLocations = [
    { lat: 14.3534, lng: 120.9895, name: 'Las Piñas Central' },
    { lat: 14.3450, lng: 120.9850, name: 'Pacita Complex' },
    { lat: 14.3620, lng: 120.9920, name: 'CBD Area' },
    { lat: 14.3380, lng: 121.0050, name: 'Industrial Zone' },
    { lat: 14.3700, lng: 120.9750, name: 'Residential Area' },
  ];

  const sensorReadings: SensorReading[] = sensorLocations.map((loc, idx) => {
    const pm25 = Math.floor(Math.random() * 250) + 15; // 15-265 μg/m³
    let status: 'good' | 'moderate' | 'unhealthy_for_sensitive' | 'unhealthy';
    if (pm25 <= 35) status = 'good';
    else if (pm25 <= 75) status = 'moderate';
    else if (pm25 <= 115) status = 'unhealthy_for_sensitive';
    else status = 'unhealthy';

    return {
      id: `sensor_${idx}`,
      pm25,
      location: loc,
      timestamp: new Date(now.getTime() - Math.random() * 3600000), // Within last hour
      status,
    };
  });

  // Generate vehicle detection data
  const vehicles: Vehicle[] = [];
  const vehicleTypes: Array<'car' | 'truck' | 'motorcycle' | 'bus'> = [
    'car',
    'truck',
    'motorcycle',
    'bus',
  ];

  for (let i = 0; i < 12; i++) {
    vehicles.push({
      id: `vehicle_${i}`,
      type: vehicleTypes[Math.floor(Math.random() * vehicleTypes.length)],
      detectedAt: new Date(now.getTime() - Math.random() * 1800000), // Within last 30 mins
      location: {
        lat: lasPinasCenter.lat + (Math.random() - 0.5) * 0.1,
        lng: lasPinasCenter.lng + (Math.random() - 0.5) * 0.1,
      },
      confidence: Math.random() * 0.3 + 0.7, // 0.7-1.0 confidence
    });
  }

  return {
    sensorReadings,
    vehicles,
  };
};

// Initialize dummy data
export const dummyData = generateDummyData();
