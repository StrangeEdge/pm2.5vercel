# Firebase Firestore Setup Guide

Complete step-by-step instructions for setting up your Firestore collections aligned with the system architecture.

## System Architecture Overview

```
ESP32 (PM2.5 Sensor)  →  Bluetooth  →  Raspberry Pi 5  →  Firebase Firestore
                                             ↑
                                             │
                                        Correlate
                                      timestamps
                                             │
Camera (Vehicle Detection via YOLO)  →      ↑

                                        ↓
                                    
                    Frontend Dashboard ← Read from Firebase
```

### Data Flow:

1. **ESP32 with PM2.5 sensor** sends reading with timestamp via Bluetooth to Raspberry Pi
2. **Camera captures vehicles** using YOLO detection
3. **Raspberry Pi 5**:
   - Receives PM2.5 readings from ESP32 (with timestamp)
   - Processes vehicle detections from camera
   - Correlates data by timestamp
   - Sends to Firebase
4. **Firebase Firestore** stores in two collections:
   - `sensorReadings` - PM2.5 data with timestamps
   - `vehicles` - Vehicle detections with timestamps
5. **Frontend Dashboard** fetches and displays data on map

---

## Prerequisites

- Firebase Project created
- Firestore Database initialized
- Access to Firebase Console
- Raspberry Pi running backend script (to send data)

---

## Step 1: Create `sensorReadings` Collection

### Method 1: Using Firebase Console UI

1. **Open Firestore Database** in Firebase Console
2. Click **"Start collection"** button
3. In the dialog:
   - **Collection ID**: `sensorReadings`
   - Click **"Next"**

4. **Add First Document**:
   - **Document ID**: Leave empty (auto-generate) OR type: `reading_001`
   - Click **"Auto ID"** or **"Custom ID"** button

5. **Add Fields** - Click **"Add field"** for each:

| Field Name | Type | Value |
|---|---|---|
| `pm25` | int64 | `45` |
| `status` | string | `moderate` |
| `timestamp` | timestamp | (current date/time) |

6. **Add Nested Fields** (location map):
   - Click **"Add field"**
   - Field name: `location`
   - Type: **map**
   - Inside the map, add:
     - `lat` (double): `14.3534`
     - `lng` (double): `120.9895`
     - `name` (string): `Las Piñas Central`

7. Click **"Save"**

### Visual Guide

```
sensorReadings (Collection)
├── reading_001 (Document)
│   ├── pm25: 45 (number)
│   ├── status: "moderate" (string)
│   ├── timestamp: 2024-05-20 10:30:00 (timestamp)
│   └── location (map)
│       ├── lat: 14.3534 (number)
│       ├── lng: 120.9895 (number)
│       └── name: "Las Piñas Central" (string)
```

---

## Step 2: Create `vehicles` Collection

1. **Click the "+" icon next to Firestore Database** or go back to root
2. Click **"Start collection"** again
3. In the dialog:
   - **Collection ID**: `vehicles`
   - Click **"Next"**

4. **Add First Document**:
   - **Document ID**: Leave empty (auto-generate) OR type: `vehicle_001`

5. **Add Fields**:

| Field Name | Type | Value |
|---|---|---|
| `type` | string | `car` |
| `confidence` | double | `0.95` |
| `detectedAt` | timestamp | (current date/time) |
| `cameraId` | string | `camera_01` |

6. **Add Nested Fields** (location map):
   - Click **"Add field"**
   - Field name: `location`
   - Type: **map**
   - Inside the map, add:
     - `lat` (double): `14.3534`
     - `lng` (double): `120.9895`

7. Click **"Save"**

### Visual Guide

```
vehicles (Collection)
├── vehicle_001 (Document)
│   ├── type: "car" (string)
│   ├── confidence: 0.95 (number)
│   ├── detectedAt: 2024-05-20 10:35:00 (timestamp)
│   ├── cameraId: "camera_01" (string)
│   └── location (map)
│       ├── lat: 14.3534 (number)
│       └── lng: 120.9895 (number)
```

---

## Step 3: Add Sample Documents

### Add More Sensor Readings

Repeat the process and add documents with different locations:

**Document 1:**
```
Fields:
- pm25 (int64): 65
- status (string): moderate
- timestamp (timestamp): [current date/time]
- location (map):
  - lat (double): 14.3450
  - lng (double): 120.9850
  - name (string): Pacita Complex
```

**Document 2:**
```
Fields:
- pm25 (int64): 120
- status (string): unhealthy
- timestamp (timestamp): [current date/time]
- location (map):
  - lat (double): 14.3620
  - lng (double): 120.9920
  - name (string): CBD Area
```

### Add More Vehicle Detections

**Document 1:**
```
Fields:
- type (string): truck
- confidence (double): 0.88
- detectedAt (timestamp): [current date/time]
- cameraId (string): camera_02
- location (map):
  - lat (double): 14.3500
  - lng (double): 120.9900
```

**Document 2:**
```
Fields:
- type (string): motorcycle
- confidence (double): 0.92
- detectedAt (timestamp): [current date/time]
- cameraId (string): camera_03
- location (map):
  - lat (double): 14.3400
  - lng (double): 120.9950
```

---

## Step 4: Set Firestore Security Rules

**IMPORTANT**: Add security rules to protect your data.

1. In Firebase Console, go to **Firestore Database** → **Rules** tab
2. Replace the default rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow reading from sensorReadings
    match /sensorReadings/{document=**} {
      allow read: if true;
      allow write: if false; // Only backend can write
    }
    
    // Allow reading from vehicles
    match /vehicles/{document=**} {
      allow read: if true;
      allow write: if false; // Only backend can write
    }
  }
}
```

3. Click **"Publish"**

---

## Step 5: Verify Collections in Console

```
Firestore Database Root
├── sensorReadings/ (Collection)
│   ├── reading_001
│   ├── reading_002
│   ├── reading_003
│   ├── reading_004
│   └── reading_005
│
└── vehicles/ (Collection)
    ├── vehicle_001
    ├── vehicle_002
    ├── vehicle_003
    ├── vehicle_004
    ├── ...
    └── vehicle_012
```

---

## Firestore Field Types Reference

When you click the type dropdown, you'll see these options:

| Type | Example | Use Case |
|---|---|---|
| **string** | `"car"`, `"Las Piñas Central"` | Text data |
| **int64** | `45`, `123` | Whole numbers |
| **double** | `0.95`, `14.3534` | Decimal numbers (coordinates, confidence) |
| **boolean** | `true`, `false` | True/false values |
| **timestamp** | `2024-05-20 10:30:00` | Date and time |
| **map** | `{ lat, lng, name }` | Nested objects/dictionaries |
| **array** | `["car", "truck"]` | Lists of values |
| **geopoint** | `lat: 14.3534, lng: 120.9895` | Geographic coordinates (alternative to map) |
| **reference** | Points to another document | Links between collections |
| **null** | N/A | Represent missing data |

### For Your Dashboard:

**sensorReadings fields:**
- `pm25` → **int64** (example: `45`)
- `status` → **string** (example: `"moderate"`)
- `timestamp` → **timestamp** (current date/time)
- `location` → **map** → contains:
  - `lat` → **double** (example: `14.3534`)
  - `lng` → **double** (example: `120.9895`)
  - `name` → **string** (example: `"Las Piñas Central"`)

**vehicles fields:**
- `type` → **string** (example: `"car"`)
- `confidence` → **double** (example: `0.95`)
- `detectedAt` → **timestamp** (current date/time)
- `cameraId` → **string** (example: `"camera_01"`)
- `location` → **map** → contains:
  - `lat` → **double** (example: `14.3534`)
  - `lng` → **double** (example: `120.9895`)

---

## Common Issues & Solutions

### Issue: "Document parent path" field

**What is it?** The parent collection path where your document belongs.

**Solution**: 
- For new collections: Leave as `/collectionName` (auto-filled)
- The path will be `/sensorReadings` for sensor readings
- The path will be `/vehicles` for vehicle detections

### Issue: Document ID not appearing

**Solution**:
- Click **"Auto ID"** to generate automatically (recommended)
- OR click **"Custom ID"** and type your own ID

### Issue: Map/Object fields not showing

**Solution**:
- In the field type dropdown, select **"map"**
- Then add nested fields inside by clicking "Add field" within the map

### Issue: Timestamp field showing error

**Solution**:
- Make sure to select **"timestamp"** type from dropdown
- Use current date/time or select from calendar picker

---

## Adding Data from Your App

Once collections are created, your app will automatically fetch data via:

```typescript
// In src/utils/firebaseDataHelpers.ts
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';

// Fetch sensor readings
const querySnapshot = await getDocs(collection(db, 'sensorReadings'));
querySnapshot.forEach((doc) => {
  console.log(doc.id, ' => ', doc.data());
});

// Fetch vehicles
const vehicleSnapshot = await getDocs(collection(db, 'vehicles'));
vehicleSnapshot.forEach((doc) => {
  console.log(doc.id, ' => ', doc.data());
});
```

---

## Backend Integration

### For Raspberry Pi 5 Backend (Python)

This runs on your Raspberry Pi to receive data from ESP32 and camera, then send to Firebase:

```python
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime
import bluetooth  # For receiving from ESP32
import json

# Initialize Firebase
cred = credentials.Certificate('firebase-key.json')
firebase_admin.initialize_app(cred)
db = firestore.client()

# ============================================================================
# 1. RECEIVE PM2.5 DATA FROM ESP32 VIA BLUETOOTH
# ============================================================================

def receive_sensor_data_from_esp32():
    """
    Receive PM2.5 readings from ESP32 via Bluetooth
    Expected format: {"pm25": 45, "timestamp": "2024-05-20T10:30:00Z"}
    """
    # Your Bluetooth setup code here
    # This is just a placeholder for the logic
    pass

# ============================================================================
# 2. PROCESS VEHICLE DETECTION FROM CAMERA (YOLO)
# ============================================================================

def process_vehicle_detection(frame):
    """
    Process camera frame using YOLO to detect vehicles
    Returns: list of detected vehicles with confidence scores
    """
    # Your YOLO detection code here
    # Returns: [{"type": "car", "confidence": 0.95, "location": {...}}]
    pass

# ============================================================================
# 3. CORRELATE SENSOR & VEHICLE DATA BY TIMESTAMP
# ============================================================================

def correlate_data(sensor_reading, vehicle_detections):
    """
    Correlate sensor reading with vehicle detections by timestamp
    """
    # Check if timestamps are within 30 seconds of each other
    sensor_time = datetime.fromisoformat(sensor_reading['timestamp'])
    
    for vehicle in vehicle_detections:
        vehicle_time = datetime.fromisoformat(vehicle['detectedAt'])
        time_diff = abs((sensor_time - vehicle_time).total_seconds())
        
        if time_diff <= 30:  # Within 30 seconds
            vehicle['correlatedWithSensor'] = True
    
    return vehicle_detections

# ============================================================================
# 4. SEND PM2.5 SENSOR READING TO FIREBASE
# ============================================================================

def add_sensor_reading_to_firebase(pm25_value, latitude, longitude, location_name, timestamp):
    """
    Add PM2.5 sensor reading to Firestore
    Called when ESP32 sends data via Bluetooth
    """
    
    # Determine air quality status
    if pm25_value <= 35:
        status = 'good'
    elif pm25_value <= 75:
        status = 'moderate'
    elif pm25_value <= 115:
        status = 'unhealthy_for_sensitive'
    else:
        status = 'unhealthy'
    
    # Add to Firebase
    db.collection('sensorReadings').add({
        'pm25': pm25_value,
        'status': status,
        'timestamp': datetime.fromisoformat(timestamp),
        'location': {
            'lat': latitude,
            'lng': longitude,
            'name': location_name
        }
    })
    
    print(f"✓ Added PM2.5 reading: {pm25_value} μg/m³ at {location_name}")

# ============================================================================
# 5. SEND VEHICLE DETECTION TO FIREBASE
# ============================================================================

def add_vehicle_detection_to_firebase(vehicle_type, confidence, latitude, longitude, 
                                      camera_id, detection_timestamp):
    """
    Add vehicle detection to Firestore
    Called when YOLO detects a vehicle from camera feed
    """
    
    db.collection('vehicles').add({
        'type': vehicle_type,  # 'car', 'truck', 'motorcycle', 'bus'
        'confidence': confidence,
        'detectedAt': datetime.fromisoformat(detection_timestamp),
        'cameraId': camera_id,
        'location': {
            'lat': latitude,
            'lng': longitude
        }
    })
    
    print(f"✓ Added vehicle detection: {vehicle_type} ({confidence*100:.1f}% confidence)")

# ============================================================================
# 6. MAIN LOOP - RASPBERRY PI WORKFLOW
# ============================================================================

def main():
    """
    Main loop running on Raspberry Pi
    1. Receive sensor data from ESP32 (Bluetooth)
    2. Receive vehicle detections from camera (YOLO)
    3. Correlate by timestamp
    4. Send both to Firebase
    """
    
    while True:
        try:
            # Step 1: Receive PM2.5 reading from ESP32
            sensor_data = receive_sensor_data_from_esp32()
            if sensor_data:
                # Send to Firebase
                add_sensor_reading_to_firebase(
                    pm25_value=sensor_data['pm25'],
                    latitude=sensor_data['location']['lat'],
                    longitude=sensor_data['location']['lng'],
                    location_name=sensor_data['location']['name'],
                    timestamp=sensor_data['timestamp']
                )
            
            # Step 2: Process vehicle detections from camera
            camera_frame = capture_camera_frame()
            vehicles = process_vehicle_detection(camera_frame)
            
            if vehicles:
                # Correlate with recent sensor reading
                if sensor_data:
                    vehicles = correlate_data(sensor_data, vehicles)
                
                # Send each vehicle detection to Firebase
                for vehicle in vehicles:
                    add_vehicle_detection_to_firebase(
                        vehicle_type=vehicle['type'],
                        confidence=vehicle['confidence'],
                        latitude=vehicle['location']['lat'],
                        longitude=vehicle['location']['lng'],
                        camera_id=vehicle.get('cameraId', 'camera_01'),
                        detection_timestamp=vehicle['detectedAt']
                    )
        
        except Exception as e:
            print(f"Error: {e}")
            continue

if __name__ == '__main__':
    main()
```

### For ESP32 Firmware (Arduino/MicroPython)

```cpp
// ESP32 code to send PM2.5 reading via Bluetooth to Raspberry Pi

#include <BluetoothSerial.h>
#include <time.h>

BluetoothSerial SerialBT;
const char* deviceName = "ESP32-PM25-Sensor";

// PM2.5 Sensor pin (e.g., analog input)
const int PM25_SENSOR_PIN = 35;

void setup() {
  Serial.begin(115200);
  SerialBT.begin(deviceName);  // Bluetooth device name
}

void loop() {
  // Read PM2.5 value from sensor
  int pm25Value = analogRead(PM25_SENSOR_PIN);
  
  // Get current timestamp
  time_t now = time(nullptr);
  struct tm* timeinfo = localtime(&now);
  char timestamp[30];
  strftime(timestamp, sizeof(timestamp), "%Y-%m-%dT%H:%M:%SZ", timeinfo);
  
  // Create JSON payload
  String payload = "{\"pm25\":" + String(pm25Value) + 
                   ",\"timestamp\":\"" + String(timestamp) + 
                   "\",\"location\":{\"lat\":14.3534,\"lng\":120.9895,\"name\":\"Las Piñas\"}}";
  
  // Send to Raspberry Pi via Bluetooth
  SerialBT.println(payload);
  Serial.println("Sent: " + payload);
  
  // Send every 5 minutes
  delay(300000);
}
```

## Timestamp Correlation Strategy

Your Raspberry Pi correlates sensor and vehicle data by timestamp:

### Example Scenario:

**Time: 10:30:00**
- ESP32 sends PM2.5 reading: `45 μg/m³` → Timestamp: `2024-05-20T10:30:00Z`
- Camera detects vehicles at nearby location → Timestamps: `2024-05-20T10:30:15Z` (±30 sec)

**Correlation Logic:**
```
If |timestamp_sensor - timestamp_vehicle| <= 30 seconds:
  → Consider them correlated
  → Store both with their timestamps
  → Frontend can display them together on map
```

### Result in Firestore:

**sensorReadings collection:**
```
Document: reading_001
├── pm25: 45
├── status: "moderate"
├── timestamp: 2024-05-20T10:30:00Z
└── location: {lat: 14.3534, lng: 120.9895, name: "Las Piñas Central"}
```

**vehicles collection (recorded within 30 seconds):**
```
Document: vehicle_001
├── type: "car"
├── confidence: 0.95
├── detectedAt: 2024-05-20T10:30:15Z
├── cameraId: "camera_01"
└── location: {lat: 14.3538, lng: 120.9898}

Document: vehicle_002
├── type: "truck"
├── confidence: 0.88
├── detectedAt: 2024-05-20T10:30:22Z
├── cameraId: "camera_01"
└── location: {lat: 14.3532, lng: 120.9892}
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      SYSTEM DEPLOYMENT                           │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│      ESP32       │  ← PM2.5 Sensor
│  + Sensor        │  Reading + Timestamp
└────────┬─────────┘
         │ Bluetooth
         ↓
┌──────────────────────────┐
│   Raspberry Pi 5         │
│  ┌────────────────────┐  │
│  │ 1. Receive data    │  │
│  │    from ESP32      │  │
│  └────────────────────┘  │
│  ┌────────────────────┐  │
│  │ 2. Process YOLO    │  │
│  │    detections      │  │
│  └────────────────────┘  │
│  ┌────────────────────┐  │
│  │ 3. Correlate by    │  │
│  │    timestamp       │  │
│  └────────────────────┘  │
└────────┬─────────────────┘
         │
         ↓
┌──────────────────────────┐
│     Firebase Firestore   │
│ ┌──────────────────────┐ │
│ │  sensorReadings      │ │
│ │  ├─ reading_001      │ │
│ │  ├─ reading_002      │ │
│ │  └─ reading_003      │ │
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │  vehicles            │ │
│ │  ├─ vehicle_001      │ │
│ │  ├─ vehicle_002      │ │
│ │  └─ vehicle_003      │ │
│ └──────────────────────┘ │
└────────┬─────────────────┘
         │
         ↓ HTTP Request
┌──────────────────────────┐
│  Frontend Dashboard      │
│  ┌────────────────────┐  │
│  │  Interactive Map   │  │
│  │  • Sensor circles  │  │
│  │  • Vehicle markers │  │
│  └────────────────────┘  │
│  ┌────────────────────┐  │
│  │  Readings Panel    │  │
│  │  • PM2.5 levels    │  │
│  │  • Status badges   │  │
│  │  • Vehicle list    │  │
│  └────────────────────┘  │
└──────────────────────────┘


┌──────────────────┐
│     Camera       │
│ (YOLO Detection) │
└────────┬─────────┘
         │ USB/Network
         ↓
    (to Raspberry Pi)
```

---

## Next Steps for Raspberry Pi Integration

1. ✅ Create Firestore collections (`sensorReadings` and `vehicles`)
2. ✅ Set up security rules (read from frontend, write from backend only)
3. **Install Firebase SDK on Raspberry Pi**:
   ```bash
   pip install firebase-admin
   ```

4. **Copy `firebase-key.json`** to Raspberry Pi from Firebase Console

5. **Run the Raspberry Pi Python script** that:
   - Listens for Bluetooth data from ESP32
   - Processes YOLO detections from camera
   - Sends to Firebase

6. **Frontend automatically fetches** updated data from Firestore

---
