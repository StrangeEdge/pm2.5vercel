import { useEffect } from 'react';
import Dashboard from './components/Dashboard'
import { testFirebaseConnection } from './utils/testFirebaseConnection';
import { seedTestData } from './utils/seedTestData';
import './App.css'

function App() {
  useEffect(() => {
    const initializeApp = async () => {
      const connectionTest = await testFirebaseConnection();

      if (connectionTest.connected && (connectionTest.dataPointsCount ?? 0) === 0) {
        console.log('📭 No data in RTDB. Seeding test data...');
        await seedTestData();
      }
    };

    initializeApp();
  }, []);

  return <Dashboard />
}

export default App
