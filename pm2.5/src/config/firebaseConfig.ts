import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore (used by backend reference code, not by dashboard)
export const db = getFirestore(app);

// Initialize Auth and sign in anonymously for RTDB access
const auth = getAuth(app);
let cachedToken: string | null = null;

export const getAuthToken = async (): Promise<string> => {
  if (cachedToken) return cachedToken;
  const cred = await signInAnonymously(auth);
  cachedToken = await cred.user.getIdToken();
  return cachedToken;
};

// Initialize Storage
export const storage = getStorage(app);

export default app;
