import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/server";
import { UpdateMemoryInputSchema } from "@/lib/memories/schema";
import { getMemory, softDeleteMemory, updateMemory } from "@/lib/memories/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ orgId: string; memoryId: string }> }) {
  const decoded = await requireAuth(req).catch((err: any) => {
    const status = typeof err?.status === "number" ? err.status : 401;
    return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status });
  });
  if (decoded instanceof NextResponse) return decoded;

  const { orgId, memoryId } = await ctx.params;
  try {
    const memory = await getMemory({ uid: decoded.uid, orgId, memoryId });
    if (!memory) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ok: true, memory });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 403;
    return NextResponse.json({ ok: false, code: "FORBIDDEN", message: err?.message ?? "Forbidden" }, { status });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ orgId: string; memoryId: string }> }) {
  const decoded = await requireAuth(req).catch((err: any) => {
    const status = typeof err?.status === "number" ? err.status : 401;
    return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status });
  });
  if (decoded instanceof NextResponse) return decoded;

  const { orgId, memoryId } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateMemoryInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, code: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    await updateMemory({
      uid: decoded.uid,
      email: decoded.email ?? null,
      orgId,
      memoryId,
      input: parsed.data,
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 403;
    return NextResponse.json({ ok: false, code: "FORBIDDEN", message: err?.message ?? "Forbidden" }, { status });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ orgId: string; memoryId: string }> }) {
  const decoded = await requireAuth(req).catch((err: any) => {
    const status = typeof err?.status === "number" ? err.status : 401;
    return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status });
  });
  if (decoded instanceof NextResponse) return decoded;

  const { orgId, memoryId } = await ctx.params;
  try {
    await softDeleteMemory({ uid: decoded.uid, email: decoded.email ?? null, orgId, memoryId });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 403;
    return NextResponse.json({ ok: false, code: "FORBIDDEN", message: err?.message ?? "Forbidden" }, { status });
  }
}


