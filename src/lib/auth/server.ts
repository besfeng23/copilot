import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";
import { FieldPath } from "firebase-admin/firestore";
import { cookies } from "next/headers";

import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

export const ID_TOKEN_COOKIE_NAME = "pp_id_token";

export function getIdTokenFromRequest(req: Request): string | null {
  const header =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (header) {
    const match = header.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (token) return token;
  }

  const cookieHeader = req.headers.get("cookie") ?? req.headers.get("Cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${ID_TOKEN_COOKIE_NAME}=([^;]+)`)
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function requireAuth(req: Request): Promise<DecodedIdToken> {
  const token = getIdTokenFromRequest(req);
  if (!token) {
    const err = new Error("Missing auth token.");
    (err as { status?: number }).status = 401;
    throw err;
  }
  try {
    return await getAdminAuth().verifyIdToken(token);
  } catch (cause) {
    const err = new Error("Invalid or expired token.");
    (err as { status?: number; cause?: unknown }).status = 401;
    (err as { cause?: unknown }).cause = cause;
    throw err;
  }
}

export type OrgRole = "owner" | "admin" | "member" | "viewer";

export async function getUserOrgRoles(uid: string): Promise<Array<{ orgId: string; role: OrgRole }>> {
  const db = getAdminDb();
  const snap = await db
    .collectionGroup("members")
    .where(FieldPath.documentId(), "==", uid)
    .get();

  return snap.docs
    .map((d) => {
      const orgId = d.ref.parent.parent?.id;
      const role = (d.data().role as OrgRole | undefined) ?? "member";
      if (!orgId) return null;
      return { orgId, role };
    })
    .filter((x): x is { orgId: string; role: OrgRole } => Boolean(x));
}

export async function requireOrgRole(
  uid: string,
  orgId: string,
  opts?: { minRole?: OrgRole }
): Promise<OrgRole> {
  const db = getAdminDb();
  const memberRef = db.doc(`orgs/${orgId}/members/${uid}`);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) {
    const err = new Error("User is not a member of this org.");
    (err as { status?: number }).status = 403;
    throw err;
  }

  const role = (memberSnap.data()?.role as OrgRole | undefined) ?? "member";
  const minRole = opts?.minRole;
  if (minRole) {
    const order: OrgRole[] = ["viewer", "member", "admin", "owner"];
    if (order.indexOf(role) < order.indexOf(minRole)) {
      const err = new Error("Insufficient permissions.");
      (err as { status?: number }).status = 403;
      throw err;
    }
  }

  return role;
}

export async function ensurePersonalBootstrap(params: {
  uid: string;
  email?: string | null;
}) {
  const db = getAdminDb();
  const orgId = params.uid;
  const orgRef = db.doc(`orgs/${orgId}`);
  const memberRef = db.doc(`orgs/${orgId}/members/${params.uid}`);
  const projectRef = db.doc(`orgs/${orgId}/projects/default`);

  const [orgSnap, memberSnap, projectSnap] = await Promise.all([
    orgRef.get(),
    memberRef.get(),
    projectRef.get(),
  ]);

  const writes: Array<Promise<unknown>> = [];
  if (!orgSnap.exists) {
    writes.push(
      orgRef.set({
        name: params.email ? `${params.email}'s Org` : "Personal Org",
        createdAt: new Date(),
      })
    );
  }
  if (!memberSnap.exists) {
    writes.push(
      memberRef.set({
        role: "owner" as OrgRole,
        createdAt: new Date(),
      })
    );
  }
  if (!projectSnap.exists) {
    writes.push(
      projectRef.set({
        name: "Default Project",
        goal: "Ship one high-signal next action at a time.",
        createdAt: new Date(),
      })
    );
  }

  if (writes.length) await Promise.all(writes);
  return { orgId, projectId: "default" as const };
}

export async function setIdTokenCookie(token: string) {
  const jar = await cookies();
  jar.set(ID_TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function clearIdTokenCookie() {
  const jar = await cookies();
  jar.set(ID_TOKEN_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

