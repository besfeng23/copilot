import 'server-only';

import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { ServiceAccount } from 'firebase-admin';

export class FirebaseAdminError extends Error {
  code: 'FIREBASE_ADMIN_NOT_CONFIGURED';
  missing: string[];

  constructor(args: { missing: string[]; message?: string }) {
    super(
      args.message ??
        'Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON, or set split vars for project_id/client_email/private_key.'
    );
    this.name = 'FirebaseAdminError';
    this.code = 'FIREBASE_ADMIN_NOT_CONFIGURED';
    this.missing = args.missing;
  }
}

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, '\n');
}

function firstNonEmpty(...vals: Array<string | undefined>) {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim().length) return v;
  }
  return undefined;
}

function readServiceAccountFromEnv(): ServiceAccount {
  // Preferred: full service account JSON string (Vercel-friendly).
  const rawJson =
    firstNonEmpty(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) ??
    // Back-compat for older deployments/configs:
    firstNonEmpty(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON);

  if (rawJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      // Don't include JSON parse error details to avoid leaking data.
      throw new FirebaseAdminError({
        missing: ['FIREBASE_SERVICE_ACCOUNT_JSON'],
        message: 'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.',
      });
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new FirebaseAdminError({
        missing: ['FIREBASE_SERVICE_ACCOUNT_JSON'],
        message: 'FIREBASE_SERVICE_ACCOUNT_JSON must parse to a JSON object.',
      });
    }

    const sa = parsed as Record<string, unknown>;
    if (typeof sa.private_key === 'string') {
      sa.private_key = normalizePrivateKey(sa.private_key);
    }

    const required = ['project_id', 'client_email', 'private_key'] as const;
    const missingFields = required.filter(
      (k) => typeof sa[k] !== 'string' || !(sa[k] as string).trim()
    );
    if (missingFields.length) {
      throw new FirebaseAdminError({
        missing: ['FIREBASE_SERVICE_ACCOUNT_JSON'],
        message: `FIREBASE_SERVICE_ACCOUNT_JSON is missing required field(s): ${missingFields.join(', ')}`,
      });
    }

    return sa as unknown as ServiceAccount;
  }

  // Split vars: accept common naming variants.
  const projectId = firstNonEmpty(
    process.env.FIREBASE_ADMIN_PROJECT_ID,
    process.env.FIREBASE_SERVICE_ACCOUNT_PROJECT_ID
  );
  const clientEmail = firstNonEmpty(
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL
  );
  const privateKeyRaw = firstNonEmpty(
    process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY
  );

  const missing: string[] = [];
  if (!projectId) missing.push('FIREBASE_ADMIN_PROJECT_ID', 'FIREBASE_SERVICE_ACCOUNT_PROJECT_ID');
  if (!clientEmail)
    missing.push('FIREBASE_ADMIN_CLIENT_EMAIL', 'FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL');
  if (!privateKeyRaw)
    missing.push('FIREBASE_ADMIN_PRIVATE_KEY', 'FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY');

  if (missing.length) {
    // Provide the preferred JSON key first (actionable, single-var setup) and then split var options.
    throw new FirebaseAdminError({
      missing: ['FIREBASE_SERVICE_ACCOUNT_JSON', ...missing],
    });
  }

  // Optional compatibility keys (accepted if present; not required).
  const type = firstNonEmpty(process.env.FIREBASE_SERVICE_ACCOUNT_TYPE);
  const privateKeyId = firstNonEmpty(process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY_ID);
  const clientId = firstNonEmpty(process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_ID);

  return {
    ...(type ? { type } : {}),
    ...(privateKeyId ? { privateKeyId } : {}),
    ...(clientId ? { clientId } : {}),
    projectId,
    clientEmail,
    privateKey: normalizePrivateKey(privateKeyRaw!),
  } as ServiceAccount;
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

