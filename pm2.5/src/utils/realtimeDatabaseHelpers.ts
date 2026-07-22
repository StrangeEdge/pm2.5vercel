/**
 * Firebase Realtime Database Helpers
 * Fetches sensor readings and vehicle detections from RTDB via REST API.
 * This is the primary data source for the dashboard.
 */

import type { SensorReading, VehicleCounts } from '../data/dummyData';
import { VEHICLE_TYPES, emptyVehicleCounts } from '../data/dummyData';
import { getAuthToken } from '../config/firebaseConfig';
import {
  classifyHotspotSession,
  type TimestampedPmReading,
  type TimestampedVehicleReading,
} from './hotspotClassification';

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
  vehicles_timestamp?: string | number;
}

interface RawHistoryDatum {
  pm25?: number | string;
  pm2_5?: number | string;
  value?: number | string;
  timestamp?: string | number;
  vehicles?: Record<string, unknown>;
  vehicles_timestamp?: string | number;
}

const safeNumber = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return isNaN(n) ? fallback : n;
};

const parseDate = (value: string | number | undefined): Date | null => {
  if (value == null) {
    return null;
  }

  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
};

const fetchJson = async <T>(path: string, token: string): Promise<T | null> => {
  try {
    const response = await fetch(`${RTDB_URL}${path}?auth=${token}`);
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const toPmHistory = (
  raw: Record<string, unknown> | null | undefined,
): TimestampedPmReading[] => {
  if (!raw || typeof raw !== 'object') {
    return [];
  }

  return Object.values(raw)
    .map((entry) => {
      const datum = entry as RawHistoryDatum | null;
      if (!datum || typeof datum !== 'object') {
        return null;
      }

      const timestamp = parseDate(datum.timestamp);
      const pm25 = safeNumber(datum.pm25 ?? datum.pm2_5 ?? datum.value, NaN);
      if (!timestamp || isNaN(pm25)) {
        return null;
      }

      return { timestamp, pm25 };
    })
    .filter((entry): entry is TimestampedPmReading => entry !== null);
};

const toVehicleHistory = (
  raw: Record<string, unknown> | null | undefined,
): TimestampedVehicleReading[] => {
  if (!raw || typeof raw !== 'object') {
    return [];
  }

  return Object.values(raw)
    .map((entry) => {
      const datum = entry as RawHistoryDatum | null;
      if (!datum || typeof datum !== 'object' || !datum.vehicles) {
        return null;
      }

      const timestamp = parseDate(datum.timestamp ?? datum.vehicles_timestamp);
      if (!timestamp) {
        return null;
      }

      const vehicles = parseVehicleCounts(datum.vehicles);
      return { timestamp, vehicles };
    })
    .filter((entry): entry is TimestampedVehicleReading => entry !== null);
};

const dedupeByTimestamp = <T extends { timestamp: Date }>(items: T[]): T[] => {
  const seen = new Set<number>();
  return items.filter((item) => {
    const key = item.timestamp.getTime();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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

// NOTE: vehicleCountsToList removed — it was unused and referenced a local
// `Vehicle` type that isn't defined in this module. Keep parsing helpers
// above and the exported RTDB helpers below.

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

    const sensorReadings = await Promise.all(
      Object.entries(rawData).map(async ([key, value]: [string, unknown]) => {
        const datum = value as RawSensorDatum | null;
        if (!datum || typeof datum !== 'object') return null;

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

        const [pmHistoryRaw, vehicleHistoryRaw] = await Promise.all([
          fetchJson<Record<string, unknown>>(
            `/pm25_history/${key}.json`,
            token,
          ),
          fetchJson<Record<string, unknown>>(
            `/vehicle_history/${key}.json`,
            token,
          ),
        ]);

        const pmHistory = dedupeByTimestamp([
          { timestamp, pm25 },
          ...toPmHistory(pmHistoryRaw),
        ]);

        const vehicleHistory = dedupeByTimestamp([
          {
            timestamp:
              parseDate(datum.vehicles_timestamp ?? datum.timestamp) ??
              timestamp,
            vehicles: vehicleCounts,
          },
          ...toVehicleHistory(vehicleHistoryRaw),
        ]);

        const hotspotSummary = classifyHotspotSession(
          pmHistory,
          vehicleHistory,
        );

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
          hotspotTier: hotspotSummary.hotspotTier,
          vehicles: vehicleCounts,
        };

        return reading;
      }),
    );

    return {
      sensorReadings: sensorReadings
        .filter((reading): reading is SensorReading => reading !== null)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
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
 * Determine PM2.5 status based on US EPA AQI breakpoints, 2024 revision.
 * Source: EPA, "Final Updates to the Air Quality Index (AQI) for
 * Particulate Matter" fact sheet, Feb 2024; effective May 6, 2024.
 * (89 Fed. Reg., Reconsideration of the NAAQS for Particulate Matter,
 * Docket EPA-HQ-OAR-2015-0072)
 *
 *   Good:                            0.0 –   9.0
 *   Moderate:                        9.1 –  35.4
 *   Unhealthy for Sensitive Groups: 35.5 –  55.4
 *   Unhealthy:                      55.5 – 125.4
 *   Very Unhealthy:                125.5 – 225.4
 *   Hazardous:                     225.5+
 *
 * NOTE: this return type was widened to add 'very_unhealthy' and
 * 'hazardous'. The SensorReading['status'] union in ../data/dummyData
 * (and any UI code that switches on status, e.g. marker colors) needs
 * the same two values added or this will fail to type-check / silently
 * fall through in places that switch exhaustively on status.
 */
function getStatusFromPM25(
  pm25: number,
):
  | 'good'
  | 'moderate'
  | 'unhealthy_for_sensitive'
  | 'unhealthy'
  | 'very_unhealthy'
  | 'hazardous' {
  if (pm25 <= 9.0) return 'good';
  if (pm25 <= 35.4) return 'moderate';
  if (pm25 <= 55.4) return 'unhealthy_for_sensitive';
  if (pm25 <= 125.4) return 'unhealthy';
  if (pm25 <= 225.4) return 'very_unhealthy';
  return 'hazardous';
}
