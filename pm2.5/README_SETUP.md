# PM2.5 & Vehicle Detection Dashboard

A React + TypeScript web application that displays real-time PM2.5 air quality sensor readings and vehicle detections using YOLO on an interactive map of Las Piñas, Philippines.

## Features

- 🗺️ **Interactive Map**: Display sensor readings and vehicle detections on an OpenStreetMap
- 📊 **Dashboard Readings**: Real-time PM2.5 levels, status indicators, and vehicle detection data
- 🎯 **Color-coded Status**: Visual indicators for air quality levels (Good, Moderate, Unhealthy for Sensitive Groups, Unhealthy)
- 🚗 **Vehicle Tracking**: Display detected vehicles with YOLO detection confidence scores
- 🔥 **Firebase Integration**: Backend setup for storing sensor data and vehicle detections
- 📱 **Responsive Design**: Works on desktop and mobile devices

## Project Structure

```
src/
├── components/
│   ├── Dashboard.tsx       # Main dashboard component
│   ├── Dashboard.css       # Dashboard styles
│   ├── Map.tsx            # Interactive map component
│   ├── Map.css            # Map styles
│   ├── ReadingsPanel.tsx   # Readings and vehicle list panel
│   └── ReadingsPanel.css   # Readings panel styles
├── config/
│   └── firebaseConfig.ts   # Firebase configuration
├── data/
│   └── dummyData.ts        # Sample data for development
├── App.tsx                 # Main app component
├── App.css                 # App styles
├── main.tsx                # React entry point
└── index.css               # Global styles
```

## Getting Started

### Prerequisites

- Node.js 16+ 
- npm or yarn

### Installation

1. **Install dependencies**:
```bash
npm install
```

2. **Start development server**:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

Output files will be in the `dist/` directory.

## Firebase Setup

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add Project"
3. Enter your project name (e.g., "pm2.5-dashboard")
4. Follow the setup wizard

### 2. Get Your Firebase Credentials

1. In the Firebase Console, click the gear icon → Project Settings
2. Scroll to "Your apps" section
3. Click "Add app" → Web
4. Copy the firebaseConfig object

### 3. Update Firebase Configuration

Edit `src/config/firebaseConfig.ts` and replace the placeholder values:

```typescript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};
```

### 4. Create Firestore Collections

In the Firebase Console:

1. Go to Firestore Database
2. Click "Create Database"
3. Create the following collections:

#### `sensorReadings` Collection

Document structure:
```json
{
  "pm25": 45,
  "location": {
    "lat": 14.3534,
    "lng": 120.9895,
    "name": "Las Piñas Central"
  },
  "timestamp": "2024-05-18T10:30:00Z",
  "status": "moderate"
}
```

#### `vehicles` Collection

Document structure:
```json
{
  "type": "car",
  "detectedAt": "2024-05-18T10:30:00Z",
  "location": {
    "lat": 14.3534,
    "lng": 120.9895
  },
  "confidence": 0.95
}
```

## Using Real Data

### Current Implementation

Currently, the dashboard uses **dummy data** for development. To use real Firebase data:

1. In `src/components/Dashboard.tsx`, uncomment the Firebase data fetching code:

```typescript
import { db } from '../config/firebaseConfig';
import { collection, getDocs } from 'firebase/firestore';

const fetchData = async () => {
  try {
    const readingsSnapshot = await getDocs(collection(db, 'sensorReadings'));
    const vehiclesSnapshot = await getDocs(collection(db, 'vehicles'));
    
    const readings = readingsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    const vehicles = vehiclesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    setSensorReadings(readings);
    setVehicles(vehicles);
  } catch (error) {
    console.error('Error fetching data:', error);
  }
};
```

### Dummy Data

The dummy data is generated in `src/data/dummyData.ts`:

- **5 sensor reading locations** across Las Piñas
- **12 vehicle detections** with random types (car, truck, motorcycle, bus)
- Auto-refresh every 30 seconds

## Air Quality Index (AQI) Scale

| PM2.5 Level (μg/m³) | Status | Color |
|---|---|---|
| 0-35 | Good | 🟢 Green |
| 36-75 | Moderate | 🟡 Yellow |
| 76-115 | Unhealthy for Sensitive Groups | 🟠 Orange |
| 116+ | Unhealthy | 🔴 Red |

## API Endpoints (For Backend Integration)

Future implementation could include:

```
GET  /api/sensor-readings       - Get all sensor readings
POST /api/sensor-readings       - Add new sensor reading
GET  /api/sensor-readings/:id   - Get specific reading
GET  /api/vehicles              - Get detected vehicles
POST /api/vehicles              - Add vehicle detection
```

## Technologies Used

- **React 19** - UI framework
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool
- **Leaflet & React-Leaflet** - Interactive mapping
- **Firebase** - Backend as a service
- **Tailwind-like CSS** - Custom styling

## Features for Future Development

- [ ] Real-time data updates using Firebase Realtime Database
- [ ] User authentication
- [ ] Historical data charts and analytics
- [ ] Data export functionality
- [ ] Alert notifications for unhealthy air quality
- [ ] Advanced filtering and search
- [ ] Dark mode support
- [ ] Mobile app version (React Native)

## License

This project is open source and available under the MIT License.

## Support

For issues or questions, please refer to:
- Firebase Documentation: https://firebase.google.com/docs
- Leaflet Documentation: https://leafletjs.com/
- React Documentation: https://react.dev/

---

**Last Updated**: May 18, 2024
