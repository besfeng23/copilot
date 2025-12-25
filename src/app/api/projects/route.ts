import { NextResponse } from 'next/server';
import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

type MemberRole = 'admin' | 'member' | 'viewer';

function jsonError(status: number, code: string, message?: string) {
  return NextResponse.json(
    { ok: false, code, ...(message ? { message } : {}) },
    { status }
  );
}

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length) return existing[0]!;

  // Prefer explicit service account JSON if provided (common on Vercel).
  const rawKey =
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ??
    process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY ??
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (rawKey) {
    const key = JSON.parse(rawKey) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    return initializeApp({ credential: cert(key as never) });
  }

  // Fall back to Application Default Credentials (works on Google-hosted runtimes).
  return initializeApp({
    projectId:
      process.env.GCLOUD_PROJECT ??
      process.env.GOOGLE_CLOUD_PROJECT ??
      process.env.FIREBASE_PROJECT_ID ??
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

async function verifyIdTokenFromAuthHeader(request: Request) {
  const authHeader = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!authHeader) return { ok: false as const, error: jsonError(401, 'UNAUTHENTICATED') };

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return { ok: false as const, error: jsonError(401, 'UNAUTHENTICATED') };

  try {
    const app = getAdminApp();
    const decoded = await getAuth(app).verifyIdToken(match[1]);
    return { ok: true as const, decoded };
  } catch {
    return { ok: false as const, error: jsonError(401, 'UNAUTHENTICATED') };
  }
}

function toIsoString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'string') return value;
  // Firestore Timestamp-like object (serialized) fallback
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = value as any;
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
  if (typeof v?._seconds === 'number') return new Date(v._seconds * 1000).toISOString();
  return null;
}

async function requireMember(uid: string) {
  const app = getAdminApp();
  const db = getFirestore(app);
  const snap = await db.doc(`orgs/default/members/${uid}`).get();
  if (!snap.exists) return { ok: false as const, error: jsonError(403, 'NOT_A_MEMBER') };

  const role = (snap.get('role') as MemberRole | undefined) ?? 'viewer';
  return { ok: true as const, role };
}

export async function GET(request: Request) {
  const verified = await verifyIdTokenFromAuthHeader(request);
  if (!verified.ok) return verified.error;

  const member = await requireMember(verified.decoded.uid);
  if (!member.ok) return member.error;

  try {
    const app = getAdminApp();
    const db = getFirestore(app);

    const querySnap = await db
      .collection('orgs')
      .doc('default')
      .collection('projects')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const projects = querySnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: (data.name as string | undefined) ?? '',
        status: (data.status as string | undefined) ?? 'active',
        createdAt: toIsoString(data.createdAt),
        createdBy: (data.createdBy as string | undefined) ?? null,
      };
    });

    return NextResponse.json({ ok: true, projects });
  } catch {
    return jsonError(500, 'INTERNAL');
  }
}

export async function POST(request: Request) {
  const verified = await verifyIdTokenFromAuthHeader(request);
  if (!verified.ok) return verified.error;

  const member = await requireMember(verified.decoded.uid);
  if (!member.ok) return member.error;
  if (member.role === 'viewer') return jsonError(403, 'READ_ONLY');

  // Parse input.
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // ignore
  }

  const name = typeof (body as { name?: unknown } | null)?.name === 'string' ? (body as any).name : '';
  if (!name.trim()) return jsonError(400, 'INVALID_ARGUMENT');

  try {
    const app = getAdminApp();
    const db = getFirestore(app);

    const ref = db.collection('orgs').doc('default').collection('projects').doc();
    await ref.set({
      name: name.trim(),
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      createdBy: verified.decoded.uid,
    });

    const created = await ref.get();
    const data = created.data() ?? {};

    return NextResponse.json({
      ok: true,
      project: {
        id: created.id,
        name: (data.name as string | undefined) ?? name.trim(),
        status: (data.status as string | undefined) ?? 'active',
        createdAt: toIsoString(data.createdAt),
        createdBy: (data.createdBy as string | undefined) ?? verified.decoded.uid,
      },
    });
  } catch {
    return jsonError(500, 'INTERNAL');
  }
}

