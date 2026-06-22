/**
 * Test connection to Firebase Realtime Database via REST API.
 * Checks if the RTDB is reachable and has data.
 */

const RTDB_URL = import.meta.env.VITE_RTDB_URL;

export interface ConnectionTestResult {
  connected: boolean;
  dataPointsCount?: number;
  error?: string;
}

export const testFirebaseConnection = async (): Promise<ConnectionTestResult> => {
  console.log('🔍 Testing Firebase RTDB connection...');

  try {
    const response = await fetch(`${RTDB_URL}/pm25_data.json?shallow=true`, {
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const count = data ? Object.keys(data).length : 0;

    console.log(`✅ RTDB connected — ${count} data point(s) found`);
    return { connected: true, dataPointsCount: count };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ RTDB connection failed:', message);
    return { connected: false, error: message };
  }
};
