import { NextResponse } from "next/server";

import { getAdminAuth } from "@/lib/firebase/admin";
import { ensurePersonalBootstrap, setIdTokenCookie } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const idToken = body?.idToken;
  if (typeof idToken !== "string" || !idToken.trim()) {
    return NextResponse.json(
      { ok: false, code: "BAD_REQUEST", message: "Missing idToken." },
      { status: 400 }
    );
  }

  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken);
  } catch {
    return NextResponse.json(
      { ok: false, code: "BAD_TOKEN", message: "Invalid or expired token." },
      { status: 401 }
    );
  }

  await setIdTokenCookie(idToken);
  await ensurePersonalBootstrap({ uid: decoded.uid, email: decoded.email ?? null });

  return NextResponse.json({ ok: true });
}

