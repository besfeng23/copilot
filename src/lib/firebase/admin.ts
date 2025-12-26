import 'server-only';

import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { ServiceAccount } from 'firebase-admin';

export class FirebaseAdminError extends Error {
  code = 'FIREBASE_ADMIN_NOT_CONFIGURED' as const;
  missing: string[];

  constructor(message: string, missing: string[]) {
    super(message);
    this.name = 'FirebaseAdminError';
    this.missing = missing;
  }
}

const ADMIN_JSON_ENV_CANDIDATES = [
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  // Back-compat name (seen in older setups / existing code).
  'FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON',
] as const;

const ADMIN_SPLIT_ENV_GROUPS = [
  {
    projectId: 'FIREBASE_ADMIN_PROJECT_ID',
    clientEmail: 'FIREBASE_ADMIN_CLIENT_EMAIL',
    privateKey: 'FIREBASE_ADMIN_PRIVATE_KEY',
  },
  {
    projectId: 'FIREBASE_SERVICE_ACCOUNT_PROJECT_ID',
    clientEmail: 'FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL',
    privateKey: 'FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY',
  },
] as const;

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, '\n');
}

function readServiceAccountFromEnv(): ServiceAccount {
  // Preferred: full JSON string (most portable to Vercel).
  for (const envName of ADMIN_JSON_ENV_CANDIDATES) {
    const raw = process.env[envName];
    if (!raw || !raw.trim()) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Never include the raw value.
      throw new FirebaseAdminError(`${envName} is not valid JSON.`, [envName]);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new FirebaseAdminError(`${envName} must parse to a JSON object.`, [envName]);
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
      // Missing *fields* inside JSON; the actionable fix is still "set/replace this env var".
      throw new FirebaseAdminError(
        `${envName} is missing required service account fields.`,
        [envName]
      );
    }

    return sa as unknown as ServiceAccount;
  }

  // Fallback: split env vars.
  for (const group of ADMIN_SPLIT_ENV_GROUPS) {
    const projectId = process.env[group.projectId];
    const clientEmail = process.env[group.clientEmail];
    const privateKeyRaw = process.env[group.privateKey];

    if (projectId && clientEmail && privateKeyRaw) {
      return {
        // Use JSON-style keys; Firebase Admin accepts the service-account JSON shape.
        project_id: projectId,
        client_email: clientEmail,
        private_key: normalizePrivateKey(privateKeyRaw),
      } as unknown as ServiceAccount;
    }
  }

  // If partially configured, report missing keys for the most "active" group.
  const groupScores = ADMIN_SPLIT_ENV_GROUPS.map((g) => {
    const present =
      (process.env[g.projectId] ? 1 : 0) +
      (process.env[g.clientEmail] ? 1 : 0) +
      (process.env[g.privateKey] ? 1 : 0);
    return { g, present };
  });

  const best = groupScores.sort((a, b) => b.present - a.present)[0];
  if (best && best.present > 0) {
    const missing = [best.g.projectId, best.g.clientEmail, best.g.privateKey].filter(
      (k) => !process.env[k] || !String(process.env[k]).trim()
    );
    throw new FirebaseAdminError(
      'Firebase Admin is not fully configured (missing required environment variables).',
      missing
    );
  }

  // Nothing set: list all supported options (names only).
  throw new FirebaseAdminError(
    'Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or split service account variables.',
    [
      'FIREBASE_SERVICE_ACCOUNT_JSON',
      'FIREBASE_ADMIN_PROJECT_ID',
      'FIREBASE_ADMIN_CLIENT_EMAIL',
      'FIREBASE_ADMIN_PRIVATE_KEY',
      'FIREBASE_SERVICE_ACCOUNT_PROJECT_ID',
      'FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL',
      'FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY',
    ]
  );
}

export function getFirebaseAdminEnvStatus(): { ok: boolean; missing: string[] } {
  try {
    readServiceAccountFromEnv();
    return { ok: true, missing: [] };
  } catch (err) {
    if (err instanceof FirebaseAdminError) {
      return { ok: false, missing: err.missing };
    }
    // Avoid leaking unexpected errors; return a generic "not ok" with the most actionable missing set.
    return {
      ok: false,
      missing: [
        'FIREBASE_SERVICE_ACCOUNT_JSON',
        'FIREBASE_ADMIN_PROJECT_ID',
        'FIREBASE_ADMIN_CLIENT_EMAIL',
        'FIREBASE_ADMIN_PRIVATE_KEY',
        'FIREBASE_SERVICE_ACCOUNT_PROJECT_ID',
        'FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL',
        'FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY',
      ],
    };
  }
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

