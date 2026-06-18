import { useState } from 'react';
import { testFirebaseConnection } from '../utils/testFirebaseConnection';
import { seedTestData } from '../utils/seedTestData';
import './TestFirebase.css';

const TestFirebase: React.FC = () => {
  const [testResult, setTestResult] = useState<any>(null);
  const [seedResult, setSeedResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleTestConnection = async () => {
    setLoading(true);
    const result = await testFirebaseConnection();
    setTestResult(result);
    setLoading(false);
  };

  const handleSeedData = async () => {
    setLoading(true);
    setSeedResult('Seeding data...');
    const success = await seedTestData();
    setSeedResult(success ? 'Data seeded successfully!' : 'Failed to seed data - check console for errors');
    setLoading(false);
  };

  return (
    <div className="test-firebase">
      <div className="test-container">
        <h1>Firebase Connection Test</h1>
        
        <div className="test-section">
          <h2>Step 1: Test Connection</h2>
          <button 
            onClick={handleTestConnection} 
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? 'Testing...' : 'Test Firebase Connection'}
          </button>
          
          {testResult && (
            <div className={`test-result ${testResult.connected ? 'success' : 'error'}`}>
              <h3>{testResult.connected ? '✅ Connected' : '❌ Connection Failed'}</h3>
              {testResult.connected ? (
                <>
                  <p>Firebase Firestore is connected!</p>
                  <p>
                    <strong>Sensor Readings:</strong> {testResult.sensorReadingsCount} documents
                  </p>
                  <p>
                    <strong>Vehicles:</strong> {testResult.vehiclesCount} documents
                  </p>
                </>
              ) : (
                <p>Error: {testResult.error}</p>
              )}
            </div>
          )}
        </div>

        <div className="test-section">
          <h2>Step 2: Seed Test Data</h2>
          <p>Click below to add sample sensor readings and vehicle detections to Firebase.</p>
          <p style={{ fontSize: '12px', color: '#666' }}>
            Note: If you get permission errors, update your Firestore security rules to allow writes.
          </p>
          
          <button 
            onClick={handleSeedData} 
            disabled={loading}
            className="btn btn-secondary"
          >
            {loading ? 'Seeding...' : 'Seed Test Data'}
          </button>
          
          {seedResult && (
            <div className={`test-result ${seedResult.includes('success') ? 'success' : 'error'}`}>
              <p>{seedResult}</p>
              {seedResult.includes('success') && (
                <p style={{ fontSize: '12px', marginTop: '10px' }}>
                  Reload the dashboard to see the data!
                </p>
              )}
            </div>
          )}
        </div>

        <div className="test-section">
          <h2>Step 3: Manual Setup (If Seeding Fails)</h2>
          <p>If the automatic seeding doesn't work, manually add data through Firebase Console:</p>
          
          <ol>
            <li>Go to <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer">Firebase Console</a></li>
            <li>Select your project → Firestore Database</li>
            <li>Check your security rules:
              <pre>{`match /sensorReadings/{document=**} {
  allow read: if true;
  allow write: if true;  // Change from 'false' to 'true' temporarily
}

match /vehicles/{document=**} {
  allow read: if true;
  allow write: if true;  // Change from 'false' to 'true' temporarily
}`}</pre>
            </li>
            <li>Click "Publish" to update rules</li>
            <li>Try seeding again</li>
            <li>
              <strong>Important:</strong> Change write rules back to `false` after testing for security!
            </li>
          </ol>
        </div>

        <div className="test-section">
          <h2>Console Output</h2>
          <p style={{ fontSize: '12px', color: '#666' }}>
            Check your browser's Developer Console (F12) for detailed error messages and logs.
          </p>
        </div>

        <div className="test-section">
          <button onClick={() => window.location.href = '/'} className="btn btn-primary">
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default TestFirebase;
