import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  voiceArtifactId: z.string().min(1),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { requireAuth } = await import('@/lib/auth/server');
  const { getArtifact, createTranscriptArtifact } = await import('@/lib/projects/server');
  const { getAdminStorage, isFirebaseAdminConfigError } = await import('@/lib/firebase/admin');
  const { transcribeAudio } = await import('@/lib/openai/transcribe');

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
    const voice = await getArtifact({ uid: decoded.uid, artifactId: parsed.data.voiceArtifactId });
    if (voice.projectId !== projectId) {
      return NextResponse.json(
        { ok: false, code: 'FORBIDDEN', message: 'Artifact does not belong to this project.' },
        { status: 403 }
      );
    }
    if (voice.kind !== 'voice' || !voice.storagePath) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'Artifact is not a voice upload.' },
        { status: 400 }
      );
    }

    const bucket = getAdminStorage().bucket();
    const [bytes] = await bucket.file(voice.storagePath).download();

    const { text } = await transcribeAudio({
      bytes: new Uint8Array(bytes),
      filename: voice.storagePath.split('/').pop() || 'voice.webm',
      mimeType: voice.mimeType ?? null,
    });

    const out = await createTranscriptArtifact({
      uid: decoded.uid,
      email: decoded.email ?? null,
      projectId,
      voiceArtifactId: voice.id,
      text,
    });

    return NextResponse.json({ ok: true, transcriptArtifactId: out.artifactId, text });
  } catch (err: any) {
    if (isFirebaseAdminConfigError(err)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Missing Firebase Admin env vars',
          details: { missing: err.missing, present: err.details },
        },
        { status: 500 }
      );
    }
    const status = typeof err?.status === 'number' ? err.status : 400;
    return NextResponse.json(
      { ok: false, code: 'VOICE_TRANSCRIBE_FAILED', message: err?.message ?? 'Transcription failed.' },
      { status }
    );
  }
}

