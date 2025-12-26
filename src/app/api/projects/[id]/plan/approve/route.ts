import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  planId: z.string().min(1),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { requireAuth } = await import('@/lib/auth/server');
  const { approvePlan } = await import('@/lib/projects/server');

  const decoded = await requireAuth(req).catch((err: any) => {
    const status = typeof err?.status === 'number' ? err.status : 401;
    return NextResponse.json(
      { ok: false, code: 'UNAUTHENTICATED', message: 'Not authenticated.' },
      { status }
    );
  });
  if (decoded instanceof NextResponse) return decoded;

  const { id: projectId } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: 'BAD_REQUEST', message: 'Invalid request body.' },
      { status: 400 }
    );
  }

  try {
    const out = await approvePlan({ uid: decoded.uid, projectId, planId: parsed.data.planId });
    return NextResponse.json({ ok: true, ...out });
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 400;
    return NextResponse.json(
      { ok: false, code: 'PLAN_APPROVE_FAILED', message: err?.message ?? 'Approve failed.' },
      { status }
    );
  }
}

