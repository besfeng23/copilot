import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

import { listMissingPublicEnv } from "@/lib/env/public";

export const MISSING_FIREBASE_CLIENT_ENV = "MISSING_FIREBASE_CLIENT_ENV" as const;

export const REQUIRED_FIREBASE_CLIENT_ENV_KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

type RequiredClientEnvKey = (typeof REQUIRED_FIREBASE_CLIENT_ENV_KEYS)[number];

function readClientEnv(key: RequiredClientEnvKey) {
  // In Next.js, NEXT_PUBLIC_* keys are safe to reference in the browser bundle.
  return process.env[key];
}

export function getMissingFirebaseClientEnvKeys(): RequiredClientEnvKey[] {
  return listMissingPublicEnv() as RequiredClientEnvKey[];
}

export function isFirebaseClientConfigured(): boolean {
  return getMissingFirebaseClientEnvKeys().length === 0;
}

function getFirebaseConfig() {
  return {
    apiKey: readClientEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: readClientEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: readClientEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: readClientEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: readClientEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    appId: readClientEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
  };
}

let _app: FirebaseApp | undefined;
let _auth: Auth | undefined;

function initClientFirebase() {
  // Prevent Firebase client SDK initialization during SSR/prerender/build.
  if (typeof window === "undefined") return;

  if (_app && _auth) return;

  if (!isFirebaseClientConfigured()) return;

  _app = !getApps().length ? initializeApp(getFirebaseConfig()) : getApp();
  _auth = getAuth(_app);
}

export function getFirebaseApp(): FirebaseApp | null {
  initClientFirebase();
  return _app ?? null;
}

export function getFirebaseAuth(): Auth | null {
  initClientFirebase();
  return _auth ?? null;
}

