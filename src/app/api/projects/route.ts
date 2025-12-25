import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token ? token : null;
}

export async function GET(req: Request) {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json(
      { ok: false, code: "NO_AUTH", message: "Missing Authorization: Bearer <token>." },
      { status: 401 }
    );
  }

  // If the server isn't configured for Firebase Admin (common in local/dev),
  // treat authenticated calls as "not authorized" instead of crashing/500ing.
  if (!process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON) {
    return NextResponse.json(
      { ok: false, code: "NOT_A_MEMBER", message: "User is not a member of this workspace." },
      { status: 403 }
    );
  }

  try {
    const { verifyIdTokenFromAuthHeader } = await import("@/lib/auth/verifyIdToken");
    await verifyIdTokenFromAuthHeader(req);
  } catch {
    return NextResponse.json(
      { ok: false, code: "BAD_TOKEN", message: "Invalid or expired ID token." },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true, projects: [] });
}

