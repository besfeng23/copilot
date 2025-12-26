import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { requireAuth } = await import('@/lib/auth/server');
  const { ensureWorkspaceBootstrapForUser } = await import('@/lib/projects/server');

  const decoded = await requireAuth(req).catch((err: any) => {
    const status = typeof err?.status === 'number' ? err.status : 401;
    return NextResponse.json(
      { ok: false, code: 'UNAUTHENTICATED', message: 'Not authenticated.' },
      { status }
    );
  });
  if (decoded instanceof NextResponse) return decoded;

  try {
    const boot = await ensureWorkspaceBootstrapForUser({
      uid: decoded.uid,
      email: decoded.email ?? null,
    });
    return NextResponse.json({ ok: true, bootstrap: boot });
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 400;
    return NextResponse.json(
      { ok: false, code: 'BOOTSTRAP_FAILED', message: err?.message ?? 'Bootstrap failed.' },
      { status }
    );
  }
}

