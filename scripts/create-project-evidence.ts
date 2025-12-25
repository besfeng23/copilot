/* eslint-disable no-console */

process.env.GCLOUD_PROJECT ??= 'demo-test';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

import { initializeApp as initClientApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth as getClientAuth,
  signInWithCustomToken,
} from 'firebase/auth';
import { initializeApp as initAdminApp, getApps } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

function toIso(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return value;
}

async function main() {
  // Admin app (talks to emulators via env vars above).
  const adminApp =
    getApps()[0] ?? initAdminApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-test' });
  const adminDb = getFirestore(adminApp);
  const adminAuth = getAdminAuth(adminApp);

  const uid = 'u1';
  await adminDb.doc(`orgs/default/members/${uid}`).set({ role: 'admin' });

  // Auth emulator: mint an ID token by signing in with a custom token.
  const customToken = await adminAuth.createCustomToken(uid);
  const clientApp = initClientApp({
    apiKey: 'fake-api-key',
    authDomain: 'localhost',
    projectId: process.env.GCLOUD_PROJECT ?? 'demo-test',
  });
  const clientAuth = getClientAuth(clientApp);
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const cred = await signInWithCustomToken(clientAuth, customToken);
  const idToken = await cred.user.getIdToken();

  // Import the route after env vars are set.
  const { POST } = await import('../src/app/api/projects/route');

  const req = new Request('http://localhost/api/projects', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'MCP Evidence Project' }),
  });

  const res = await POST(req);
  const json = await res.json();

  if (!json?.ok) {
    throw new Error(`API returned error: ${JSON.stringify(json)}`);
  }

  const projectId = json.project.id as string;
  const docPath = `orgs/default/projects/${projectId}`;
  const snap = await adminDb.doc(docPath).get();

  console.log(
    JSON.stringify(
      {
        createdViaApi: true,
        apiResponse: json,
        firestoreDocPath: docPath,
        firestoreDoc: snap.exists
          ? {
              id: snap.id,
              ...snap.data(),
              createdAt: toIso(snap.get('createdAt')),
            }
          : null,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

