'use client';

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const isConfigured = Object.values(firebaseConfig).every(
  (v) => typeof v === 'string' && v.trim().length > 0
);

const app = isConfigured ? (!getApps().length ? initializeApp(firebaseConfig) : getApp()) : null;

const auth: Auth = isConfigured
  ? getAuth(app!)
  : (new Proxy(
      {},
      {
        get() {
          throw new Error(
            'Firebase client is not configured. Set NEXT_PUBLIC_FIREBASE_* environment variables.'
          );
        },
      }
    ) as Auth);

export { app, auth };
