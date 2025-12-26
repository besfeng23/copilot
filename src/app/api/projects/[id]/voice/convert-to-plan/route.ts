import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  transcriptArtifactId: z.string().min(1),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { requireAuth } = await import('@/lib/auth/server');
  const { getArtifact, requireProjectAccess, createPlan, writePromptArtifacts } = await import(
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

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: 'BAD_REQUEST', message: 'Invalid request body.' },
      { status: 400 }
    );
  }

  try {
    const { project } = await requireProjectAccess({ uid: decoded.uid, projectId, minRole: 'member' });
    const transcript = await getArtifact({ uid: decoded.uid, artifactId: parsed.data.transcriptArtifactId });

    if (transcript.projectId !== projectId) {
      return NextResponse.json(
        { ok: false, code: 'FORBIDDEN', message: 'Artifact does not belong to this project.' },
        { status: 403 }
      );
    }
    if (transcript.kind !== 'transcript' || !transcript.text) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'Artifact is not a transcript.' },
        { status: 400 }
      );
    }

    const plan = await generatePlanFromIntake({
      projectName: project.name,
      projectGoal: project.goal ?? null,
      intakeTranscript: `[voice:transcript] ${transcript.text}`,
    });

    const planRecord = await createPlan({
      uid: decoded.uid,
      email: decoded.email ?? null,
      projectId,
      plan,
      source: 'voice',
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
      { ok: false, code: 'VOICE_CONVERT_FAILED', message: err?.message ?? 'Convert-to-plan failed.' },
      { status }
    );
  }
}

