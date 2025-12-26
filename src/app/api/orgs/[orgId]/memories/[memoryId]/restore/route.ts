import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/server";
import { restoreMemory } from "@/lib/memories/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ orgId: string; memoryId: string }> }) {
  const decoded = await requireAuth(req).catch((err: any) => {
    const status = typeof err?.status === "number" ? err.status : 401;
    return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status });
  });
  if (decoded instanceof NextResponse) return decoded;

  const { orgId, memoryId } = await ctx.params;
  try {
    await restoreMemory({ uid: decoded.uid, email: decoded.email ?? null, orgId, memoryId });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 403;
    return NextResponse.json({ ok: false, code: "FORBIDDEN", message: err?.message ?? "Forbidden" }, { status });
  }
}


