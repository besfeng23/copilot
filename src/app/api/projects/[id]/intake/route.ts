import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { requireAuth } = await import('@/lib/auth/server');
  const { listIntakeMessages, requireProjectAccess } = await import('@/lib/projects/server');

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
  const limit = z.coerce.number().int().min(1).max(500).optional().safeParse(url.searchParams.get('limit'));
  const lim = limit.success ? limit.data : undefined;

  try {
    const { project } = await requireProjectAccess({ uid: decoded.uid, projectId, minRole: 'viewer' });
    const messages = await listIntakeMessages({ uid: decoded.uid, projectId, limit: lim });
    return NextResponse.json({ ok: true, project, messages });
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 400;
    return NextResponse.json(
      { ok: false, code: 'INTAKE_READ_FAILED', message: err?.message ?? 'Intake read failed.' },
      { status }
    );
  }
}

