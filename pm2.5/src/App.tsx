import { useEffect } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './components/Dashboard'
import HistoryPage from './components/HistoryPage';
import { testFirebaseConnection } from './utils/testFirebaseConnection';
import { seedTestData } from './utils/seedTestData';
import './App.css'

function App() {
  useEffect(() => {
    const initializeApp = async () => {
      const connectionTest = await testFirebaseConnection();

      if (connectionTest.connected && (connectionTest.dataPointsCount ?? 0) === 0) {
        console.log('No data in RTDB. Seeding test data...');
        await seedTestData();
      }
    };

    initializeApp();
  }, []);

  return (
    <>
      <nav className="app-nav">
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/history">History</NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/history" element={<HistoryPage />} />
      </Routes>
    </>
  )
}

export default App
