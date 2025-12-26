import 'server-only';

import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { ServiceAccount } from 'firebase-admin';

function readServiceAccountFromEnv(): ServiceAccount {
  // Preferred: explicit, Vercel-friendly env vars.
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (projectId && clientEmail && privateKeyRaw) {
    return {
      projectId,
      clientEmail,
      privateKey: privateKeyRaw.replace(/\\n/g, '\n'),
    };
  }

  // Back-compat: a full JSON service account string (older config).
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      'Missing Firebase Admin env vars. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY.'
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON is not valid JSON. JSON.parse failed: ${msg}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON must parse to a JSON object.');
  }

  const sa = parsed as Record<string, unknown>;
  if (typeof sa.private_key === 'string') {
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  }

  const required = ['project_id', 'client_email', 'private_key'] as const;
  const missing = required.filter((k) => typeof sa[k] !== 'string' || !(sa[k] as string).trim());
  if (missing.length) {
    throw new Error(`FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON missing required field(s): ${missing.join(', ')}`);
  }

  return sa as unknown as ServiceAccount;
}

let cachedAdminApp: ReturnType<typeof getApp> | null = null;

export function getAdminApp() {
  if (cachedAdminApp) return cachedAdminApp;

  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
  cachedAdminApp =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          credential: cert(readServiceAccountFromEnv()),
          storageBucket: storageBucket && storageBucket.trim().length ? storageBucket : undefined,
        });

  return cachedAdminApp;
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

export function getAdminStorage() {
  return getStorage(getAdminApp());
}

