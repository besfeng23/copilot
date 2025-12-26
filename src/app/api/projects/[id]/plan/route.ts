import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { requireAuth } = await import('@/lib/auth/server');
  const { getPlan, getLatestPlan, requireProjectAccess } = await import('@/lib/projects/server');

  const decoded = await requireAuth(req).catch((err: any) => {
    const status = typeof err?.status === 'number' ? err.status : 401;
    return NextResponse.json(
      { ok: false, code: 'UNAUTHENTICATED', message: 'Not authenticated.' },
      { status }
    );
  });
  if (decoded instanceof NextResponse) return decoded;

  const { id: projectId } = await ctx.params;
  const url = new URL(req.url);
  const planId = url.searchParams.get('planId');

  try {
    const { project } = await requireProjectAccess({ uid: decoded.uid, projectId, minRole: 'viewer' });

    if (planId && z.string().min(1).safeParse(planId).success) {
      const plan = await getPlan({ uid: decoded.uid, projectId, planId });
      return NextResponse.json({ ok: true, project, plan });
    }

    // Default: approved plan, otherwise latest version.
    if (project.approvedPlanId) {
      const plan = await getPlan({ uid: decoded.uid, projectId, planId: project.approvedPlanId });
      return NextResponse.json({ ok: true, project, plan });
    }

    const latest = await getLatestPlan({ uid: decoded.uid, projectId });
    return NextResponse.json({ ok: true, project, plan: latest });
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 400;
    return NextResponse.json(
      { ok: false, code: 'PLAN_READ_FAILED', message: err?.message ?? 'Plan read failed.' },
      { status }
    );
  }
}

