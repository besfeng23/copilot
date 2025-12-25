import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const isBrowser = typeof window !== 'undefined';
const hasConfig = Object.values(firebaseConfig).every((v) => typeof v === 'string' && v.length > 0);

// During `next build`, modules can be evaluated server-side. Avoid initializing the
// client SDK unless we are in the browser and have config, otherwise the build
// can fail with "auth/invalid-api-key".
const app = (isBrowser && hasConfig ? (!getApps().length ? initializeApp(firebaseConfig) : getApp()) : undefined) as ReturnType<
  typeof getApp
>;
const auth = (isBrowser && hasConfig ? getAuth(app) : undefined) as ReturnType<typeof getAuth>;

export { app, auth };
