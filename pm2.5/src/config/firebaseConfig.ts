import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// TODO: Replace with your Firebase project credentials
const firebaseConfig = {
  apiKey: "AIzaSyDYauzEr-zZabiMK15OCWq_6acjyPxjH9w",
  authDomain: "thesis-1dbf3.firebaseapp.com",
  projectId: "thesis-1dbf3",
  storageBucket: "thesis-1dbf3.firebasestorage.app",
  messagingSenderId: "256921948849",
  appId: "1:256921948849:web:504281f022356c83360890",
  measurementId: "G-S4C1LV8N49"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Storage
export const storage = getStorage(app);

export default app;
