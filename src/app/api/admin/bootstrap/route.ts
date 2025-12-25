import { verifyIdToken, VerifyIdTokenError } from '@/lib/auth/verifyIdToken';
import { FirebaseAdminInitError, getAdmin, getDb } from '@/lib/firebase/admin';

type ErrorCode =
  | 'NO_AUTH'
  | 'BAD_TOKEN'
  | 'MISSING_SERVICE_ACCOUNT_JSON'
  | 'BAD_SERVICE_ACCOUNT_JSON'
  | 'ADMIN_INIT_FAILED'
  | 'UNKNOWN';

type SuccessBody = { ok: true; orgId: 'default'; role: 'admin' };
type ErrorBody = { ok: false; code: ErrorCode; message: string };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(code: ErrorCode, message: string, status: number): Response {
  const body: ErrorBody = { ok: false, code, message };
  return Response.json(body, { status });
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (!auth) return null;

  const [scheme, token] = auth.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token.trim();
}

async function bootstrapForUid(uid: string): Promise<void> {
  const admin = getAdmin();
  const db = getDb();
  const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();

  const orgRef = db.collection('orgs').doc('default');
  const memberRef = orgRef.collection('members').doc(uid);

  await db.runTransaction(async (tx) => {
    const [orgSnap, memberSnap] = await Promise.all([tx.get(orgRef), tx.get(memberRef)]);

    const orgPatch: Record<string, unknown> = {};
    if (!orgSnap.exists || orgSnap.get('createdAt') == null) orgPatch.createdAt = serverTimestamp;
    if (!orgSnap.exists || orgSnap.get('createdBy') == null) orgPatch.createdBy = uid;
    if (Object.keys(orgPatch).length > 0) {
      tx.set(orgRef, orgPatch, { merge: true });
    }

    const memberPatch: Record<string, unknown> = { role: 'admin' };
    if (!memberSnap.exists || memberSnap.get('createdAt') == null) memberPatch.createdAt = serverTimestamp;
    tx.set(memberRef, memberPatch, { merge: true });
  });
}

export async function POST(req: Request): Promise<Response> {
  try {
    const token = getBearerToken(req);
    if (!token) return jsonError('NO_AUTH', 'Missing Authorization: Bearer <Firebase ID token>.', 401);

    const decoded = await verifyIdToken(token);
    if (!decoded?.uid) return jsonError('BAD_TOKEN', 'Invalid Firebase ID token.', 401);

    await bootstrapForUid(decoded.uid);

    const body: SuccessBody = { ok: true, orgId: 'default', role: 'admin' };
    return Response.json(body, { status: 200 });
  } catch (err) {
    if (err instanceof VerifyIdTokenError) {
      return jsonError('BAD_TOKEN', err.message, 401);
    }

    if (err instanceof FirebaseAdminInitError) {
      return jsonError(err.code, err.message, 500);
    }

    const message = err instanceof Error ? err.message : 'Unknown error.';
    return jsonError('UNKNOWN', message, 500);
  }
}

export function GET(): Response {
  return jsonError('UNKNOWN', 'Method Not Allowed', 405);
}
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
export const OPTIONS = GET;
