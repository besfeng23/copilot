import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/server";
import { createTag, listTags } from "@/lib/memories/server";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function GET(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const decoded = await requireAuth(req).catch((err: any) => {
    const status = typeof err?.status === "number" ? err.status : 401;
    return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status });
  });
  if (decoded instanceof NextResponse) return decoded;

  const { orgId } = await ctx.params;
  try {
    const tags = await listTags({ uid: decoded.uid, orgId });
    return NextResponse.json({ ok: true, tags });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 403;
    return NextResponse.json({ ok: false, code: "FORBIDDEN", message: err?.message ?? "Forbidden" }, { status });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const decoded = await requireAuth(req).catch((err: any) => {
    const status = typeof err?.status === "number" ? err.status : 401;
    return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status });
  });
  if (decoded instanceof NextResponse) return decoded;

  const { orgId } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, code: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    const out = await createTag({
      uid: decoded.uid,
      email: decoded.email ?? null,
      orgId,
      name: parsed.data.name,
    });
    return NextResponse.json({ ok: true, id: out.id });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 403;
    return NextResponse.json({ ok: false, code: "FORBIDDEN", message: err?.message ?? "Forbidden" }, { status });
  }
}


