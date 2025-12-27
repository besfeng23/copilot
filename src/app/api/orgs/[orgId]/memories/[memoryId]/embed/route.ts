import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/server";
import { embedMemory } from "@/lib/memories/embeddings";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ orgId: string; memoryId: string }> }) {
  const decoded = await requireAuth(req).catch((err: any) => {
    const status = typeof err?.status === "number" ? err.status : 401;
    return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status });
  });
  if (decoded instanceof NextResponse) return decoded;

  const { orgId, memoryId } = await ctx.params;
  try {
    const out = await embedMemory({ uid: decoded.uid, email: decoded.email ?? null, orgId, memoryId });
    if (!out.ok) {
      return NextResponse.json(out, { status: out.code === "OPENAI_NOT_CONFIGURED" ? 501 : 404 });
    }
    return NextResponse.json(out);
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 400;
    return NextResponse.json({ ok: false, code: "EMBED_FAILED", message: err?.message ?? "Embed failed." }, { status });
  }
}


