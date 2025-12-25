import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let _app: FirebaseApp | undefined;
let _auth: Auth | undefined;

function hasClientFirebaseConfig() {
  return Object.values(firebaseConfig).every(
    (v) => typeof v === "string" && v.trim().length > 0
  );
}

function initClientFirebase() {
  // Prevent Firebase client SDK initialization during SSR/prerender/build.
  if (typeof window === "undefined") return;

  if (_app && _auth) return;
  if (!hasClientFirebaseConfig()) {
    throw new Error(
      "Missing Firebase client env vars. Ensure NEXT_PUBLIC_FIREBASE_* are set."
    );
  }

  _app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  _auth = getAuth(_app);
}

export function getFirebaseApp(): FirebaseApp {
  initClientFirebase();
  if (!_app) throw new Error("Firebase app is not initialized.");
  return _app;
}

export function getFirebaseAuth(): Auth {
  initClientFirebase();
  if (!_auth) throw new Error("Firebase auth is not initialized.");
  return _auth;
}
