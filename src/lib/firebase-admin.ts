import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

function parseServiceAccount(raw: string) {
  const trimmed = raw.trim();

  // Support either raw JSON or base64-encoded JSON.
  let jsonString = trimmed;
  if (!trimmed.startsWith('{')) {
    try {
      jsonString = Buffer.from(trimmed, 'base64').toString('utf8').trim();
    } catch {
      // Keep original string and let JSON.parse throw a useful error below.
      jsonString = trimmed;
    }
  }

  // Common when pasted into env: newlines become literal "\n".
  jsonString = jsonString.replace(/\\n/g, '\n');

  return JSON.parse(jsonString) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
    [key: string]: unknown;
  };
}

function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON is not set');
  }

  const serviceAccount = parseServiceAccount(raw);
  return initializeApp({
    credential: cert(serviceAccount as never),
  });
}

let cachedDb: Firestore | null = null;

export function getAdminDb(): Firestore {
  if (cachedDb) return cachedDb;
  const app = getAdminApp();
  cachedDb = getFirestore(app);
  return cachedDb;
}

