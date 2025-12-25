import 'server-only';

import admin from 'firebase-admin';

export type FirebaseAdminInitErrorCode =
  | 'MISSING_SERVICE_ACCOUNT_JSON'
  | 'BAD_SERVICE_ACCOUNT_JSON'
  | 'ADMIN_INIT_FAILED';

export class FirebaseAdminInitError extends Error {
  readonly code: FirebaseAdminInitErrorCode;

  constructor(code: FirebaseAdminInitErrorCode, message: string) {
    super(message);
    this.name = 'FirebaseAdminInitError';
    this.code = code;
  }
}

function getServiceAccountJson(): string {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new FirebaseAdminInitError(
      'MISSING_SERVICE_ACCOUNT_JSON',
      'Missing FIREBASE_SERVICE_ACCOUNT_JSON environment variable.'
    );
  }
  return raw;
}

function parseServiceAccount(raw: string): admin.ServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FirebaseAdminInitError(
      'BAD_SERVICE_ACCOUNT_JSON',
      'FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON.'
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new FirebaseAdminInitError(
      'BAD_SERVICE_ACCOUNT_JSON',
      'FIREBASE_SERVICE_ACCOUNT_JSON must be a JSON object.'
    );
  }

  const serviceAccount = parsed as Record<string, unknown>;
  const privateKey = serviceAccount.private_key;
  if (typeof privateKey === 'string') {
    // Common in env vars: newlines are escaped as "\\n"
    serviceAccount.private_key = privateKey.replace(/\\n/g, '\n');
  }

  return serviceAccount as unknown as admin.ServiceAccount;
}

function ensureAdminInitialized(): void {
  if (admin.apps.length > 0) return;

  const serviceAccount = parseServiceAccount(getServiceAccountJson());
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to initialize Firebase Admin SDK.';
    throw new FirebaseAdminInitError('ADMIN_INIT_FAILED', message);
  }
}

export function getAdmin(): typeof admin {
  ensureAdminInitialized();
  return admin;
}

export function getDb(): admin.firestore.Firestore {
  ensureAdminInitialized();
  return admin.firestore();
}

export function getAuth(): admin.auth.Auth {
  ensureAdminInitialized();
  return admin.auth();
}
