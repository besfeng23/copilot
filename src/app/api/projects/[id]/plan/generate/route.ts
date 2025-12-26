import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { requireAuth } = await import('@/lib/auth/server');
  const { listIntakeMessages, requireProjectAccess, createPlan, writePromptArtifacts } = await import(
    '@/lib/projects/server'
  );
  const { generatePlanFromIntake } = await import('@/lib/openai/plan');

  const decoded = await requireAuth(req).catch((err: any) => {
    const status = typeof err?.status === 'number' ? err.status : 401;
    return NextResponse.json(
      { ok: false, code: 'UNAUTHENTICATED', message: 'Not authenticated.' },
      { status }
    );
  });
  if (decoded instanceof NextResponse) return decoded;

  const { id: projectId } = await ctx.params;

  try {
    const { project } = await requireProjectAccess({ uid: decoded.uid, projectId, minRole: 'member' });
    const messages = await listIntakeMessages({ uid: decoded.uid, projectId, limit: 300 });

    const intakeTranscript = messages
      .map((m, idx) => `[intake:msg:${idx + 1}] ${m.role.toUpperCase()}: ${m.text}`)
      .join('\n');

    const plan = await generatePlanFromIntake({
      projectName: project.name,
      projectGoal: project.goal ?? null,
      intakeTranscript,
    });

    const planRecord = await createPlan({
      uid: decoded.uid,
      email: decoded.email ?? null,
      projectId,
      plan,
      source: 'chat',
    });

    const artifacts = await writePromptArtifacts({
      uid: decoded.uid,
      email: decoded.email ?? null,
      projectId,
      planId: planRecord.id,
      prompts: plan.prompts,
    });

    return NextResponse.json({
      ok: true,
      planId: planRecord.id,
      version: planRecord.version,
      plan,
      promptArtifactIds: artifacts.artifactIds,
    });
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 400;
    return NextResponse.json(
      { ok: false, code: 'PLAN_GENERATE_FAILED', message: err?.message ?? 'Plan generation failed.' },
      { status }
    );
  }
}

