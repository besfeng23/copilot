import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

export const FIREBASE_CLIENT_ENV_KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

export const MISSING_FIREBASE_CLIENT_ENV = "MISSING_FIREBASE_CLIENT_ENV" as const;

export type FirebaseClientEnvKey = (typeof FIREBASE_CLIENT_ENV_KEYS)[number];

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _initAttempted = false;

export function getMissingFirebaseClientEnv(): FirebaseClientEnvKey[] {
  return FIREBASE_CLIENT_ENV_KEYS.filter((k) => {
    const v = process.env[k];
    return typeof v !== "string" || v.trim().length === 0;
  });
}

export function isFirebaseClientConfigured(): boolean {
  return getMissingFirebaseClientEnv().length === 0;
}

function initClientFirebase() {
  // Prevent Firebase client SDK initialization during SSR/prerender/build.
  if (typeof window === "undefined") return;

  if (_app && _auth) return;
  if (_initAttempted) return;
  _initAttempted = true;
  if (!isFirebaseClientConfigured()) return;

  try {
    _app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    _auth = getAuth(_app);
  } catch {
    // Never throw during render; consumers should treat null as "not configured/unavailable".
    _app = null;
    _auth = null;
  }
}

export function getFirebaseApp(): FirebaseApp | null {
  initClientFirebase();
  return _app;
}

export function getFirebaseAuth(): Auth | null {
  initClientFirebase();
  return _auth;
}

