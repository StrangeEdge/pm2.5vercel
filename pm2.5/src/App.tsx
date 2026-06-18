import { useEffect } from 'react';
import Dashboard from './components/Dashboard'
import { testFirebaseConnection } from './utils/testFirebaseConnection';
import { seedTestData } from './utils/seedTestData';
import './App.css'

function App() {
  useEffect(() => {
    const initializeApp = async () => {
      // Test Firebase connection
      const connectionTest = await testFirebaseConnection();
      
      // If no data in Firebase, seed test data
      if (connectionTest.connected && connectionTest.sensorReadingsCount === 0) {
        console.log('📭 No data in Firebase. Seeding test data...');
        await seedTestData();
      }
    };

    initializeApp();
  }, []);

  return <Dashboard />
}

export default App
