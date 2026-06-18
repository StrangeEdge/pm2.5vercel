/**
 * Firebase Test Data Seeding Script
 * Add sample data to Firebase Firestore for testing
 */

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';

export const seedTestData = async () => {
  console.log('🌱 Seeding Firebase with test data...');
  
  try {
    // Test sensor readings with proper structure
    const sensorReadings = [
      {
        pm25: 45,
        location: {
          lat: 14.3534,
          lng: 120.9895,
          name: 'Las Piñas Central'
        },
        status: 'moderate'
      },
      {
        pm25: 120,
        location: {
          lat: 14.3450,
          lng: 120.9850,
          name: 'Pacita Complex'
        },
        status: 'unhealthy'
      },
      {
        pm25: 28,
        location: {
          lat: 14.3620,
          lng: 120.9920,
          name: 'CBD Area'
        },
        status: 'good'
      }
    ];

    // Test vehicle detections
    const vehicles = [
      {
        type: 'car',
        location: {
          lat: 14.3534,
          lng: 120.9895
        },
        confidence: 0.95
      },
      {
        type: 'truck',
        location: {
          lat: 14.3450,
          lng: 120.9850
        },
        confidence: 0.88
      }
    ];

    // Add sensor readings
    console.log('📡 Adding sensor readings...');
    let sensorCount = 0;
    for (const reading of sensorReadings) {
      try {
        const docRef = await addDoc(collection(db, 'sensorReadings'), {
          ...reading,
          timestamp: serverTimestamp()
        });
        sensorCount++;
        console.log(`✓ Added sensor reading: ${reading.location.name} (${reading.pm25} μg/m³) - ID: ${docRef.id}`);
      } catch (error) {
        console.error(`✗ Failed to add sensor reading ${reading.location.name}:`, error);
      }
    }

    // Add vehicle detections
    console.log('🚗 Adding vehicle detections...');
    let vehicleCount = 0;
    for (const vehicle of vehicles) {
      try {
        const docRef = await addDoc(collection(db, 'vehicles'), {
          ...vehicle,
          detectedAt: serverTimestamp()
        });
        vehicleCount++;
        console.log(`✓ Added vehicle: ${vehicle.type} (confidence: ${vehicle.confidence}) - ID: ${docRef.id}`);
      } catch (error) {
        console.error(`✗ Failed to add vehicle ${vehicle.type}:`, error);
      }
    }

    console.log(`✅ Test data seeding complete! Added ${sensorCount} sensors and ${vehicleCount} vehicles.`);
    return sensorCount > 0 || vehicleCount > 0;
  } catch (error: any) {
    console.error('❌ Error seeding test data:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Full error:', error);
    return false;
  }
};
