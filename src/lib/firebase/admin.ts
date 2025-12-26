import 'server-only';

import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { ServiceAccount } from 'firebase-admin';

type FirebaseAdminEnvStrategy = 'serviceAccountJson' | 'splitVars' | null;

type FirebaseAdminEnvDetails = {
  hasServiceAccountJson: boolean;
  hasLegacyServiceAccountJson: boolean;
  hasProjectId: boolean;
  hasClientEmail: boolean;
  hasPrivateKey: boolean;
  hasStorageBucket: boolean;
};

export class FirebaseAdminConfigError extends Error {
  code = 'FIREBASE_ADMIN_CONFIG' as const;
  status = 500 as const;
  strategy: FirebaseAdminEnvStrategy;
  missing: string[];
  details: FirebaseAdminEnvDetails;

  constructor(args: {
    message: string;
    strategy: FirebaseAdminEnvStrategy;
    missing: string[];
    details: FirebaseAdminEnvDetails;
  }) {
    super(args.message);
    this.name = 'FirebaseAdminConfigError';
    this.strategy = args.strategy;
    this.missing = args.missing;
    this.details = args.details;
  }
}

export function isFirebaseAdminConfigError(err: unknown): err is FirebaseAdminConfigError {
  return err instanceof Error && err.name === 'FirebaseAdminConfigError';
}

export function getFirebaseAdminConfigStatus(): {
  firebaseAdminConfigured: boolean;
  strategy: FirebaseAdminEnvStrategy;
  missing: string[];
  details: FirebaseAdminEnvDetails;
} {
  const details: FirebaseAdminEnvDetails = {
    hasServiceAccountJson: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    hasLegacyServiceAccountJson: !!process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON,
    hasProjectId: !!process.env.FIREBASE_ADMIN_PROJECT_ID,
    hasClientEmail: !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    hasPrivateKey: !!process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    hasStorageBucket: !!process.env.FIREBASE_STORAGE_BUCKET,
  };

  if (details.hasServiceAccountJson || details.hasLegacyServiceAccountJson) {
    return { firebaseAdminConfigured: true, strategy: 'serviceAccountJson', missing: [], details };
  }

  if (details.hasProjectId && details.hasClientEmail && details.hasPrivateKey) {
    return { firebaseAdminConfigured: true, strategy: 'splitVars', missing: [], details };
  }

  const missing: string[] = [];
  if (!details.hasServiceAccountJson && !details.hasLegacyServiceAccountJson) {
    if (!details.hasProjectId) missing.push('FIREBASE_ADMIN_PROJECT_ID');
    if (!details.hasClientEmail) missing.push('FIREBASE_ADMIN_CLIENT_EMAIL');
    if (!details.hasPrivateKey) missing.push('FIREBASE_ADMIN_PRIVATE_KEY');
  }

  return { firebaseAdminConfigured: false, strategy: null, missing, details };
}

function normalizePrivateKey(privateKeyRaw: string) {
  return privateKeyRaw.replace(/\\n/g, '\n');
}

function readServiceAccountFromEnv(): ServiceAccount {
  // Preferred: full JSON service account (Vercel-friendly).
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  if (rawJson && rawJson.trim().length) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new FirebaseAdminConfigError({
        message: `FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. JSON.parse failed: ${msg}`,
        strategy: 'serviceAccountJson',
        missing: [],
        details: getFirebaseAdminConfigStatus().details,
      });
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new FirebaseAdminConfigError({
        message: 'FIREBASE_SERVICE_ACCOUNT_JSON must parse to a JSON object.',
        strategy: 'serviceAccountJson',
        missing: [],
        details: getFirebaseAdminConfigStatus().details,
      });
    }

    const sa = parsed as Record<string, unknown>;
    if (typeof sa.private_key === 'string') {
      sa.private_key = normalizePrivateKey(sa.private_key);
    }

    const required = ['project_id', 'client_email', 'private_key'] as const;
    const missing = required.filter((k) => typeof sa[k] !== 'string' || !(sa[k] as string).trim());
    if (missing.length) {
      throw new FirebaseAdminConfigError({
        message: `FIREBASE_SERVICE_ACCOUNT_JSON missing required field(s): ${missing.join(', ')}`,
        strategy: 'serviceAccountJson',
        missing: missing.map((m) => `service_account.${m}`),
        details: getFirebaseAdminConfigStatus().details,
      });
    }

    return sa as unknown as ServiceAccount;
  }

  // Alternative: split env vars.
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (projectId && clientEmail && privateKeyRaw) {
    return {
      projectId,
      clientEmail,
      privateKey: normalizePrivateKey(privateKeyRaw),
    };
  }

  const status = getFirebaseAdminConfigStatus();
  throw new FirebaseAdminConfigError({
    message: 'Missing Firebase Admin env vars',
    strategy: null,
    missing: status.missing,
    details: status.details,
  });
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

