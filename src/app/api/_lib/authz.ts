import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';

import { adminDb } from '@/app/api/_lib/firebaseAdmin';
import { jsonError } from '@/app/api/_lib/http';
import { verifyIdTokenFromAuthHeader, VerifyIdTokenError } from '@/app/api/_lib/verifyIdToken';

export type OrgRole = 'admin' | 'member';

export type AuthedOrgContext = {
  orgId: string;
  uid: string;
  email?: string;
  role: OrgRole;
};

function getOrgId(req: Request, uid: string): string {
  // Minimal multi-org support: caller can specify org via header.
  // Default org is the caller's uid (personal workspace).
  const h = req.headers.get('x-org-id') ?? req.headers.get('X-Org-Id');
  const orgId = (h ?? '').trim();
  return orgId || uid;
}

export async function requireOrgMember(req: Request): Promise<AuthedOrgContext | Response> {
  if (!process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON) {
    return jsonError(403, 'NOT_A_MEMBER', 'User is not a member of this workspace.');
  }

  let decoded;
  try {
    decoded = await verifyIdTokenFromAuthHeader(req);
  } catch (err) {
    const code = err instanceof VerifyIdTokenError ? err.code : 'BAD_TOKEN';
    return jsonError(401, code, err instanceof Error ? err.message : 'Invalid or expired ID token.');
  }

  const uid = decoded.uid;
  const orgId = getOrgId(req, uid);

  const memberRef = adminDb.doc(`orgs/${orgId}/members/${uid}`);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) {
    return jsonError(403, 'NOT_A_MEMBER', 'User is not a member of this workspace.', { orgId });
  }

  const role = (memberSnap.data()?.role as OrgRole | undefined) ?? 'member';
  return { orgId, uid, email: decoded.email, role };
}

export async function requireOrgAdmin(req: Request): Promise<AuthedOrgContext | Response> {
  const ctx = await requireOrgMember(req);
  if (ctx instanceof Response) return ctx;
  if (ctx.role !== 'admin') {
    return jsonError(403, 'NOT_AN_ADMIN', 'Only org admins may perform this action.', { orgId: ctx.orgId });
  }
  return ctx;
}

/**
 * Idempotently ensures a "personal org" exists for this user, with the caller as admin.
 * Used by bootstrap.
 */
export async function ensurePersonalOrgForCaller(req: Request): Promise<AuthedOrgContext | Response> {
  if (!process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON) {
    return jsonError(500, 'SERVER_NOT_CONFIGURED', 'Server is not configured for Firebase Admin.');
  }

  let decoded;
  try {
    decoded = await verifyIdTokenFromAuthHeader(req);
  } catch (err) {
    const code = err instanceof VerifyIdTokenError ? err.code : 'BAD_TOKEN';
    return jsonError(401, code, err instanceof Error ? err.message : 'Invalid or expired ID token.');
  }

  const uid = decoded.uid;
  const orgId = uid;

  const orgRef = adminDb.doc(`orgs/${orgId}`);
  const memberRef = adminDb.doc(`orgs/${orgId}/members/${uid}`);

  await adminDb.runTransaction(async (tx) => {
    const [orgSnap, memberSnap] = await Promise.all([tx.get(orgRef), tx.get(memberRef)]);

    if (!orgSnap.exists) {
      tx.set(orgRef, {
        name: decoded.email ? decoded.email.split('@')[0] : 'Personal Workspace',
        createdAt: FieldValue.serverTimestamp(),
        createdBy: uid,
      });
    }

    if (!memberSnap.exists) {
      tx.set(memberRef, {
        role: 'admin',
        createdAt: FieldValue.serverTimestamp(),
        createdBy: uid,
      });
    }
  });

  return { orgId, uid, email: decoded.email, role: 'admin' };
}

