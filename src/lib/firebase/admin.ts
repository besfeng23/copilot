import 'server-only';

import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { ServiceAccount } from 'firebase-admin';

function readServiceAccountFromEnv(): ServiceAccount {
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      'Missing env var FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON. Set it to the Firebase service account JSON string.'
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON is not valid JSON. JSON.parse failed: ${msg}`
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON must parse to a JSON object.');
  }

  const sa = parsed as Record<string, unknown>;

  // Normalize escaped newlines in private keys (common in env var storage).
  if (typeof sa.private_key === 'string') {
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  }

  const required = ['project_id', 'client_email', 'private_key'] as const;
  const missing = required.filter((k) => typeof sa[k] !== 'string' || !(sa[k] as string).trim());
  if (missing.length) {
    throw new Error(
      `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON missing required field(s): ${missing.join(', ')}`
    );
  }

  return sa as unknown as ServiceAccount;
}

const adminApp =
  getApps().length > 0
    ? getApp()
    : initializeApp({
        credential: cert(readServiceAccountFromEnv()),
      });

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);

