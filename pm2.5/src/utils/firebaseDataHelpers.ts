/**
 * BACKEND REFERENCE CODE — not used by the dashboard.
 *
 * This file documents how a backend service (Node.js or Python) would
 * write sensor data to Firestore. The dashboard reads from RTDB; these
 * helpers exist as a reference for building a future backend server.
 *
 * See system.md for the intended architecture.
 */

import { 
  collection, doc, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  orderBy, 
  getDocs,
  writeBatch,
  Timestamp,
  limit
} from 'firebase/firestore';
import { db } from '../config/firebaseConfig';

// ============================================================================
// SENSOR READINGS - Store PM2.5 readings
// ============================================================================

export interface SensorReadingInput {
  pm25: number; // μg/m³
  location: {
    lat: number;
    lng: number;
    name: string;
  };
  status?: 'good' | 'moderate' | 'unhealthy_for_sensitive' | 'unhealthy';
}

/**
 * Add a new sensor reading to Firestore
 * 
 * Example usage from your Node.js/Python backend:
 * - When MQTT receives data from PM2.5 sensor
 * - When processing data from sensor API
 */
export const addSensorReading = async (reading: SensorReadingInput) => {
  try {
    const docRef = await addDoc(collection(db, 'sensorReadings'), {
      ...reading,
      timestamp: serverTimestamp(),
      createdAt: new Date().toISOString(),
    });
    
    console.log('Sensor reading added with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error adding sensor reading:', error);
    throw error;
  }
};

// ============================================================================
// VEHICLE DETECTIONS - Store YOLO detection results
// ============================================================================

export interface VehicleDetectionInput {
  type: 'car' | 'truck' | 'motorcycle' | 'bus' | 'other';
  location: {
    lat: number;
    lng: number;
  };
  confidence: number; // 0-1
  imageUrl?: string; // URL to detection image
  cameraId?: string; // ID of camera/sensor
}

/**
 * Add a new vehicle detection to Firestore
 * 
 * Example usage from your YOLO detection system:
 * - When vehicle is detected by CCTV camera
 * - Post-processing of YOLO model output
 */
export const addVehicleDetection = async (detection: VehicleDetectionInput) => {
  try {
    const docRef = await addDoc(collection(db, 'vehicles'), {
      ...detection,
      detectedAt: serverTimestamp(),
      processedAt: new Date().toISOString(),
    });
    
    console.log('Vehicle detection added with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error adding vehicle detection:', error);
    throw error;
  }
};

// ============================================================================
// BATCH OPERATIONS - Store multiple readings at once
// ============================================================================

/**
 * Add multiple sensor readings in a batch operation
 * More efficient for bulk uploads
 */
export const addBatchSensorReadings = async (
  readings: SensorReadingInput[]
) => {
  try {
    const batch = writeBatch(db);
    
    readings.forEach((reading) => {
      const docRef = doc(collection(db, 'sensorReadings'));
      
      batch.set(docRef, {
        ...reading,
        timestamp: serverTimestamp(),
      });
    });
    
    await batch.commit();
    console.log(`Batch of ${readings.length} sensor readings added`);
  } catch (error) {
    console.error('Error adding batch readings:', error);
    throw error;
  }
};

// ============================================================================
// PYTHON BACKEND EXAMPLE
// ============================================================================

/*
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime

# Initialize Firebase (use your credentials JSON)
cred = credentials.Certificate('path/to/your-firebase-credentials.json')
firebase_admin.initialize_app(cred)
db = firestore.client()

def add_pm25_reading(pm25_value, latitude, longitude, location_name):
    '''Add PM2.5 sensor reading from MQTT or API'''
    reading = {
        'pm25': pm25_value,
        'location': {
            'lat': latitude,
            'lng': longitude,
            'name': location_name
        },
        'timestamp': datetime.now(),
        'status': get_pm25_status(pm25_value)
    }
    
    db.collection('sensorReadings').add(reading)
    print(f"Added PM2.5 reading: {pm25_value} μg/m³")

def add_vehicle_detection(vehicle_type, confidence, latitude, longitude, camera_id=None):
    '''Add vehicle detection from YOLO model'''
    detection = {
        'type': vehicle_type,  # 'car', 'truck', 'motorcycle', 'bus'
        'confidence': confidence,
        'location': {
            'lat': latitude,
            'lng': longitude
        },
        'detectedAt': datetime.now(),
        'cameraId': camera_id
    }
    
    db.collection('vehicles').add(detection)
    print(f"Added vehicle detection: {vehicle_type} ({confidence*100:.1f}% confidence)")

def get_pm25_status(pm25):
    '''Determine air quality status from PM2.5 level'''
    if pm25 <= 35:
        return 'good'
    elif pm25 <= 75:
        return 'moderate'
    elif pm25 <= 115:
        return 'unhealthy_for_sensitive'
    else:
        return 'unhealthy'
*/

// ============================================================================
// NODE.JS BACKEND EXAMPLE
// ============================================================================

/*
const admin = require('firebase-admin');

const serviceAccount = require('./firebase-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function addPM25Reading(pm25Value, latitude, longitude, locationName) {
  const reading = {
    pm25: pm25Value,
    location: {
      lat: latitude,
      lng: longitude,
      name: locationName
    },
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    status: getPM25Status(pm25Value)
  };
  
  const docRef = await db.collection('sensorReadings').add(reading);
  console.log(`Added PM2.5 reading: ${pm25Value} μg/m³ with ID: ${docRef.id}`);
  return docRef.id;
}

async function addVehicleDetection(vehicleType, confidence, latitude, longitude, cameraId) {
  const detection = {
    type: vehicleType,
    confidence: confidence,
    location: {
      lat: latitude,
      lng: longitude
    },
    detectedAt: admin.firestore.FieldValue.serverTimestamp(),
    cameraId: cameraId
  };
  
  const docRef = await db.collection('vehicles').add(detection);
  console.log(`Added vehicle detection: ${vehicleType} (${(confidence*100).toFixed(1)}% confidence)`);
  return docRef.id;
}

function getPM25Status(pm25) {
  if (pm25 <= 35) return 'good';
  if (pm25 <= 75) return 'moderate';
  if (pm25 <= 115) return 'unhealthy_for_sensitive';
  return 'unhealthy';
}
*/

// ============================================================================
// QUERYING DATA FROM FIRESTORE (Frontend)
// ============================================================================



/**
 * Get sensor readings from last hour
 */
export const getRecentSensorReadings = async () => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const q = query(
    collection(db, 'sensorReadings'),
    where('timestamp', '>=', oneHourAgo),
    orderBy('timestamp', 'desc'),
    limit(100)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};

/**
 * Get recent vehicle detections (last 30 minutes)
 */
export const getRecentVehicleDetections = async () => {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  
  const q = query(
    collection(db, 'vehicles'),
    where('detectedAt', '>=', thirtyMinutesAgo),
    orderBy('detectedAt', 'desc'),
    limit(50)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};

/**
 * Get specific vehicle type detections
 */
export const getVehicleDetectionsByType = async (vehicleType: string) => {
  const q = query(
    collection(db, 'vehicles'),
    where('type', '==', vehicleType),
    orderBy('detectedAt', 'desc'),
    limit(100)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};

// ============================================================================
// DATE RANGE QUERIES - Filter data by custom date/time range
// ============================================================================

/**
 * Get sensor readings within a specific date range
 * @param startDate - Start date (e.g., new Date('2024-05-20'))
 * @param endDate - End date (e.g., new Date('2024-05-21'))
 */
export const getSensorReadingsByDateRange = async (
  startDate: Date,
  endDate: Date
) => {
  try {
    const q = query(
      collection(db, 'sensorReadings'),
      where('timestamp', '>=', Timestamp.fromDate(startDate)),
      where('timestamp', '<=', Timestamp.fromDate(endDate)),
      orderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        pm25: data['pm2.5'] || data.pm25 || 0,
        location: data.location,
        timestamp: data.timestamp,
        status: data.status
      };
    });
  } catch (error) {
    console.error('Error fetching sensor readings by date range:', error);
    return [];
  }
};

/**
 * Get vehicle detections within a specific date range
 * @param startDate - Start date (e.g., new Date('2024-05-20'))
 * @param endDate - End date (e.g., new Date('2024-05-21'))
 */
export const getVehicleDetectionsByDateRange = async (
  startDate: Date,
  endDate: Date
) => {
  try {
    const q = query(
      collection(db, 'vehicles'),
      where('detectedAt', '>=', Timestamp.fromDate(startDate)),
      where('detectedAt', '<=', Timestamp.fromDate(endDate)),
      orderBy('detectedAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching vehicle detections by date range:', error);
    return [];
  }
};

/**
 * Get all data for a specific day
 * @param date - Date to query (e.g., new Date('2024-05-20'))
 */
export const getDataForDay = async (date: Date) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const [readings, vehicles] = await Promise.all([
    getSensorReadingsByDateRange(startOfDay, endOfDay),
    getVehicleDetectionsByDateRange(startOfDay, endOfDay)
  ]);
  
  return { readings, vehicles };
};

/**
 * Get data for the last N hours
 * @param hours - Number of hours to look back
 */
export const getDataForLastHours = async (hours: number) => {
  const endDate = new Date();
  const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const [readings, vehicles] = await Promise.all([
    getSensorReadingsByDateRange(startDate, endDate),
    getVehicleDetectionsByDateRange(startDate, endDate)
  ]);
  
  return { readings, vehicles };
};

/**
 * Get most recent data (last 24 hours by default)
 */
export const getLatestData = async (hours: number = 24) => {
  return getDataForLastHours(hours);
};

// ============================================================================
// TIPS FOR INTEGRATION
// ============================================================================

/*
1. MQTT SENSOR INTEGRATION:
   - Subscribe to MQTT topic for PM2.5 readings
   - Call addSensorReading() for each new reading
   - Store location and timestamp

2. YOLO VEHICLE DETECTION:
   - Process camera feed with YOLO model
   - Extract vehicle type and confidence
   - Get GPS coordinates from camera location
   - Call addVehicleDetection() for each detection

3. DATA RETENTION:
   - Consider archiving old readings (>30 days)
   - Set up Firestore TTL policies
   - Create separate collections for historical data

4. SECURITY:
   - Set up Firestore Security Rules
   - Use service accounts for backend writes
   - Restrict frontend to read-only access (or filter by timestamp)

5. PERFORMANCE:
   - Use batch operations for bulk inserts
   - Create indexes for frequently queried fields
   - Implement pagination for large datasets
*/

