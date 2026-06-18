/**
 * Firebase Connection Test
 * Use this to verify Firebase is working and check what data exists
 */

import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';

export const testFirebaseConnection = async () => {
  console.log('🔍 Testing Firebase Connection...');
  
  try {
    // Test 1: Check if we can connect to Firestore
    console.log('✓ Firebase initialized');
    
    // Test 2: Try to read from sensorReadings collection
    console.log('📡 Checking sensorReadings collection...');
    const sensorReadingsRef = collection(db, 'sensorReadings');
    const sensorReadingsQuery = query(sensorReadingsRef, limit(10));
    const sensorSnapshot = await getDocs(sensorReadingsQuery);
    
    console.log(`✓ sensorReadings collection has ${sensorSnapshot.size} documents`);
    
    if (sensorSnapshot.size > 0) {
      console.log('📊 Sample sensor reading:', sensorSnapshot.docs[0].data());
    } else {
      console.warn('⚠️  No sensor readings found in Firebase');
    }
    
    // Test 3: Try to read from vehicles collection
    console.log('🚗 Checking vehicles collection...');
    const vehiclesRef = collection(db, 'vehicles');
    const vehiclesQuery = query(vehiclesRef, limit(10));
    const vehiclesSnapshot = await getDocs(vehiclesQuery);
    
    console.log(`✓ vehicles collection has ${vehiclesSnapshot.size} documents`);
    
    if (vehiclesSnapshot.size > 0) {
      console.log('🎯 Sample vehicle detection:', vehiclesSnapshot.docs[0].data());
    } else {
      console.warn('⚠️  No vehicle detections found in Firebase');
    }
    
    return {
      connected: true,
      sensorReadingsCount: sensorSnapshot.size,
      vehiclesCount: vehiclesSnapshot.size
    };
  } catch (error: any) {
    console.error('❌ Firebase Connection Error:', error);
    console.error('Error Code:', error.code);
    console.error('Error Message:', error.message);
    
    return {
      connected: false,
      error: error.message
    };
  }
};
