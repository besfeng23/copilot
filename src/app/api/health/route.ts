import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const { getFirebaseAdminConfigStatus } = await import("@/lib/firebase/admin");
  const fb = getFirebaseAdminConfigStatus();

  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT_SHA ??
    null;

  return NextResponse.json({
    ok: true,
    firebaseAdminConfigured: fb.firebaseAdminConfigured,
    firebaseAdminStrategy: fb.strategy,
    commit,
  });
}

