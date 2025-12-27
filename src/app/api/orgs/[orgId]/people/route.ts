import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/server";
import { createPerson, listPeople } from "@/lib/memories/server";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  aliases: z.array(z.string().min(1).max(200)).default([]),
});

export async function GET(_req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const decoded = await requireAuth(_req).catch((err: any) => {
    const status = typeof err?.status === "number" ? err.status : 401;
    return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status });
  });
  if (decoded instanceof NextResponse) return decoded;

  const { orgId } = await ctx.params;
  try {
    const people = await listPeople({ uid: decoded.uid, orgId });
    return NextResponse.json({ ok: true, people });
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
    const out = await createPerson({
      uid: decoded.uid,
      email: decoded.email ?? null,
      orgId,
      name: parsed.data.name,
      aliases: parsed.data.aliases,
    });
    return NextResponse.json({ ok: true, id: out.id });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 403;
    return NextResponse.json({ ok: false, code: "FORBIDDEN", message: err?.message ?? "Forbidden" }, { status });
  }
}


