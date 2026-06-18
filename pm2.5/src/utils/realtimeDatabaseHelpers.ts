/**
 * Firebase Realtime Database Helpers
 * Functions to fetch sensor readings and vehicle detections from RTDB
 * Uses REST API to avoid database URL configuration issues
 */

import type { SensorReading, Vehicle } from '../data/dummyData';

// Firebase Realtime Database URL
const RTDB_URL = 'https://pm25map-9f801-default-rtdb.asia-southeast1.firebasedatabase.app';

/**
 * Get data from Realtime Database using REST API
 */
export const getRealtimeData = async () => {
  try {
    console.log('📡 Fetching from Realtime Database via REST API...');
    
    const response = await fetch(
      `${RTDB_URL}/pm25_data.json`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const rawData = await response.json();
    
    if (!rawData) {
      console.log('No data in Realtime Database');
      return { sensorReadings: [], vehicles: [] };
    }
    
    console.log('Raw data from RTDB:', rawData);
    
    // Transform RTDB data to match SensorReading interface
    const sensorReadings: SensorReading[] = [];
    
    Object.entries(rawData).forEach(([key, value]: [string, any]) => {
      if (value && typeof value === 'object') {
        // Handle different data structures from RTDB
        const reading: SensorReading = {
          id: key,
          pm25: value.pm25 || value.pm2_5 || value.value || 0,
          location: {
            lat: value.location?.lat || value.lat || 14.3534,
            lng: value.location?.lng || value.lng || 120.9895,
            name: value.location?.name || value.name || value.location_name || `Sensor ${key}`,
          },
          timestamp: value.timestamp ? new Date(value.timestamp) : new Date(),
          status: value.status || getStatusFromPM25(value.pm25 || value.value || 0),
        };
        
        sensorReadings.push(reading);
        console.log(`✓ Added sensor reading: ${reading.location.name} - ${reading.pm25} μg/m³`);
      }
    });
    
    return {
      sensorReadings,
      vehicles: [] // TODO: Update if you have vehicle data structure
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
    // Fetch initial data
    getRealtimeData().then(callback);
    
    // Poll for updates every 3 seconds
    const pollInterval = setInterval(async () => {
      const data = await getRealtimeData();
      callback(data);
    }, 3000);
    
    // Return unsubscribe function
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
