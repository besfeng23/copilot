import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/server";
import { CreateMemoryInputSchema } from "@/lib/memories/schema";
import { createMemory, listMemories } from "@/lib/memories/server";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  personId: z.string().optional(),
  tagId: z.string().optional(),
  q: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  includeDeleted: z.coerce.boolean().optional(),
});

export async function GET(req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const decoded = await requireAuth(req).catch((err: any) => {
    const status = typeof err?.status === "number" ? err.status : 401;
    return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status });
  });
  if (decoded instanceof NextResponse) return decoded;

  const { orgId } = await ctx.params;
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, code: "BAD_REQUEST" }, { status: 400 });
  }

  const from = parsed.data.from ? new Date(parsed.data.from) : null;
  const to = parsed.data.to ? new Date(parsed.data.to) : null;

  try {
    const out = await listMemories({
      uid: decoded.uid,
      orgId,
      limit: parsed.data.limit ?? 25,
      cursor: parsed.data.cursor ?? null,
      personId: parsed.data.personId ?? null,
      tagId: parsed.data.tagId ?? null,
      q: parsed.data.q ?? null,
      from: from && !Number.isNaN(from.getTime()) ? from : null,
      to: to && !Number.isNaN(to.getTime()) ? to : null,
      includeDeleted: parsed.data.includeDeleted ?? false,
    });
    return NextResponse.json({ ok: true, items: out.items, nextCursor: out.nextCursor });
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
  const parsed = CreateMemoryInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, code: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    const out = await createMemory({
      uid: decoded.uid,
      email: decoded.email ?? null,
      orgId,
      input: parsed.data,
    });
    return NextResponse.json({ ok: true, id: out.id });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 403;
    return NextResponse.json({ ok: false, code: "FORBIDDEN", message: err?.message ?? "Forbidden" }, { status });
  }
}


