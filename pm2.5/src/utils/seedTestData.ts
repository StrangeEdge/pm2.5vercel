/**
 * Seed test data into Firebase Realtime Database via REST API.
 * This sends data to the same path (/pm25_data) the Python simulators use.
 */

import { pushSensorReading } from './realtimeDatabaseHelpers';

const SENSOR_LOCATIONS = [
  { name: 'Las Piñas Central', lat: 14.3534, lng: 120.9895 },
  { name: 'Pacita Complex', lat: 14.3450, lng: 120.9850 },
  { name: 'CBD Area', lat: 14.3620, lng: 120.9920 },
  { name: 'Industrial Zone', lat: 14.3380, lng: 121.0050 },
  { name: 'Residential Area', lat: 14.3700, lng: 120.9750 },
];

export const seedTestData = async () => {
  console.log('🌱 Seeding Firebase RTDB with test data...');

  try {
    let successCount = 0;

    for (const loc of SENSOR_LOCATIONS) {
      const pm25 = Math.floor(Math.random() * 120) + 20;
      const vehicles = {
        Car: Math.floor(Math.random() * 8),
        Jeep: Math.floor(Math.random() * 6),
        Truck: Math.floor(Math.random() * 5),
        Tricycle: Math.floor(Math.random() * 4),
        Motorcycle: Math.floor(Math.random() * 6),
        Bus: Math.floor(Math.random() * 3),
      };

      await pushSensorReading({
        latitude: loc.lat,
        longitude: loc.lng,
        pm25,
        timestamp: new Date().toISOString(),
        vehicles,
      });

      successCount++;
      console.log(`✓ Seeded ${loc.name}: PM2.5=${pm25}, vehicles=${Object.values(vehicles).reduce((a, b) => a + b, 0)}`);
    }

    console.log(`✅ Seeded ${successCount} sensor readings into RTDB`);
    return successCount > 0;
  } catch (error: unknown) {
    console.error('❌ Error seeding test data:', error instanceof Error ? error.message : error);
    return false;
  }
};
