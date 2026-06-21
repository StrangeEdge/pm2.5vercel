/**
 * Firebase Realtime Database Helpers
 * Functions to fetch sensor readings and vehicle detections from RTDB
 * Uses REST API to avoid database URL configuration issues
 */

import type { SensorReading, Vehicle, VehicleCounts } from '../data/dummyData';
import { VEHICLE_TYPES, emptyVehicleCounts } from '../data/dummyData';

// Firebase Realtime Database URL
const RTDB_URL = 'https://pm25map-9f801-default-rtdb.asia-southeast1.firebasedatabase.app';

const parseVehicleCounts = (rawVehicles: Record<string, unknown> | undefined): VehicleCounts => {
  const vehicles = emptyVehicleCounts();

  if (!rawVehicles || typeof rawVehicles !== 'object') {
    return vehicles;
  }

  VEHICLE_TYPES.forEach((type) => {
    const value = rawVehicles[type];
    vehicles[type] = typeof value === 'number' ? value : Number(value) || 0;
  });

  return vehicles;
};

const vehicleCountsToList = (
  vehicles: VehicleCounts,
  readingId: string,
  location: { lat: number; lng: number },
  detectedAt: Date
): Vehicle[] => {
  const detections: Vehicle[] = [];

  VEHICLE_TYPES.forEach((type) => {
    const count = vehicles[type] || 0;
    for (let index = 0; index < count; index += 1) {
      detections.push({
        id: `${readingId}_${type}_${index}`,
        type: type.toLowerCase() as Vehicle['type'],
        detectedAt,
        location,
        confidence: 1,
      });
    }
  });

  return detections;
};

/**
 * Get data from Realtime Database using REST API
 */
export const getRealtimeData = async () => {
  try {
    console.log('📡 Fetching from Realtime Database via REST API...');

    const response = await fetch(`${RTDB_URL}/pm25_data.json`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const rawData = await response.json();

    if (!rawData) {
      console.log('No data in Realtime Database');
      return { sensorReadings: [], vehicles: [] };
    }

    console.log('Raw data from RTDB:', rawData);

    const sensorReadings: SensorReading[] = [];
    const vehicles: Vehicle[] = [];

    Object.entries(rawData).forEach(([key, value]: [string, any]) => {
      if (value && typeof value === 'object') {
        const latitude = Number(value.latitude ?? value.location?.lat ?? value.lat ?? 14.3534);
        const longitude = Number(value.longitude ?? value.location?.lng ?? value.lng ?? 120.9895);
        const pm25 = Number(value.pm25 ?? value.pm2_5 ?? value.value ?? 0) || 0;
        const timestamp = value.timestamp ? new Date(value.timestamp) : new Date();
        const vehicleCounts = parseVehicleCounts(value.vehicles);

        const reading: SensorReading = {
          id: key,
          pm25,
          location: {
            lat: latitude,
            lng: longitude,
            name: value.location?.name || value.name || value.location_name || `Sensor ${key.slice(-6)}`,
          },
          timestamp,
          status: getStatusFromPM25(pm25),
          vehicles: vehicleCounts,
        };

        sensorReadings.push(reading);
        vehicles.push(
          ...vehicleCountsToList(vehicleCounts, key, reading.location, timestamp)
        );
        console.log(
          `✓ Added sensor reading: ${reading.location.name} - ${reading.pm25} μg/m³, vehicles: ${JSON.stringify(vehicleCounts)}`
        );
      }
    });

    return {
      sensorReadings,
      vehicles,
    };
  } catch (error) {
    console.error('Error fetching from Realtime Database:', error);
    return { sensorReadings: [], vehicles: [] };
  }
};

/**
 * Poll for real-time updates from RTDB
 * Note: REST API doesn't support true real-time like WebSockets, so we poll
 */
export const subscribeToRealtimeData = (
  callback: (data: { sensorReadings: SensorReading[]; vehicles: Vehicle[] }) => void
) => {
  try {
    getRealtimeData().then(callback);

    const pollInterval = setInterval(async () => {
      const data = await getRealtimeData();
      callback(data);
    }, 3000);

    return () => clearInterval(pollInterval);
  } catch (error) {
    console.error('Error subscribing to Realtime Database:', error);
    return () => {};
  }
};

/**
 * Determine PM2.5 status based on value
 */
function getStatusFromPM25(pm25: number): 'good' | 'moderate' | 'unhealthy_for_sensitive' | 'unhealthy' {
  if (pm25 <= 35) return 'good';
  if (pm25 <= 75) return 'moderate';
  if (pm25 <= 115) return 'unhealthy_for_sensitive';
  return 'unhealthy';
}
