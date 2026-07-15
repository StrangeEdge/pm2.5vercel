/**
 * Firebase Realtime Database Helpers
 * Fetches sensor readings and vehicle detections from RTDB via REST API.
 * This is the primary data source for the dashboard.
 */

import type { SensorReading, VehicleCounts } from '../data/dummyData';
import { VEHICLE_TYPES, emptyVehicleCounts } from '../data/dummyData';
import { getAuthToken } from '../config/firebaseConfig';

// Firebase Realtime Database URL from environment variables
const RTDB_URL = import.meta.env.VITE_RTDB_URL;

interface RawSensorDatum {
  latitude?: number | string;
  longitude?: number | string;
  pm25?: number | string;
  pm2_5?: number | string;
  value?: number | string;
  timestamp?: string | number;
  name?: string;
  location_name?: string;
  lat?: number | string;
  lng?: number | string;
  location?: {
    lat?: number | string;
    lng?: number | string;
    name?: string;
  };
  vehicles?: Record<string, unknown>;
}

const safeNumber = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return isNaN(n) ? fallback : n;
};

const parseVehicleCounts = (
  rawVehicles: Record<string, unknown> | undefined,
): VehicleCounts => {
  const vehicles = emptyVehicleCounts();

  if (!rawVehicles || typeof rawVehicles !== 'object') {
    return vehicles;
  }

  VEHICLE_TYPES.forEach((type) => {
    const value = rawVehicles[type];
    vehicles[type] = typeof value === 'number' && !isNaN(value) ? value : 0;
  });

  return vehicles;
};

const vehicleCountsToList = (
  vehicles: VehicleCounts,
  readingId: string,
  location: { lat: number; lng: number },
  detectedAt: Date,
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
    const token = await getAuthToken();
    const response = await fetch(`${RTDB_URL}/pm25_data.json?auth=${token}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const rawData = await response.json();

    if (!rawData) {
      return { sensorReadings: [] };
    }

    const sensorReadings: SensorReading[] = [];

    Object.entries(rawData).forEach(([key, value]: [string, unknown]) => {
      const datum = value as RawSensorDatum | null;
      if (!datum || typeof datum !== 'object') return;

      const latitude = safeNumber(
        datum.latitude ?? datum.location?.lat ?? datum.lat,
        14.3534,
      );
      const longitude = safeNumber(
        datum.longitude ?? datum.location?.lng ?? datum.lng,
        120.9895,
      );
      const pm25 = safeNumber(datum.pm25 ?? datum.pm2_5 ?? datum.value, 0);
      const timestamp = datum.timestamp
        ? new Date(datum.timestamp)
        : new Date();
      const vehicleCounts = parseVehicleCounts(datum.vehicles);

      const reading: SensorReading = {
        id: key,
        pm25,
        location: {
          lat: latitude,
          lng: longitude,
          name:
            datum.location?.name ||
            datum.name ||
            datum.location_name ||
            `Sensor ${key.slice(-6)}`,
        },
        timestamp,
        status: getStatusFromPM25(pm25),
        vehicles: vehicleCounts,
      };

      sensorReadings.push(reading);
    });

    return {
      sensorReadings: sensorReadings.sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
      ),
    };
  } catch (error) {
    console.error('Error fetching from Realtime Database:', error);
    return { sensorReadings: [] };
  }
};

/**
 * Push a sensor reading to RTDB (used for seeding test data)
 */
export const pushSensorReading = async (reading: {
  latitude: number;
  longitude: number;
  pm25: number;
  timestamp: string;
  vehicles: Record<string, number>;
}) => {
  const token = await getAuthToken();
  const response = await fetch(`${RTDB_URL}/pm25_data.json?auth=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reading),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Determine PM2.5 status based on WHO/EPA guidelines
 */
function getStatusFromPM25(
  pm25: number,
): 'good' | 'moderate' | 'unhealthy_for_sensitive' | 'unhealthy' {
  if (pm25 <= 35) return 'good';
  if (pm25 <= 75) return 'moderate';
  if (pm25 <= 115) return 'unhealthy_for_sensitive';
  return 'unhealthy';
}
