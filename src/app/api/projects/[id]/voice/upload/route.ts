import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { requireAuth } = await import('@/lib/auth/server');
  const { requireProjectAccess, createVoiceArtifact } = await import('@/lib/projects/server');
  const { getAdminStorage, isFirebaseAdminConfigError } = await import('@/lib/firebase/admin');

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
    await requireProjectAccess({ uid: decoded.uid, projectId, minRole: 'member' });

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, code: 'BAD_REQUEST', message: 'Expected multipart form-data with field "file".' },
        { status: 400 }
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const maxBytes = 25 * 1024 * 1024; // 25MB
    if (bytes.byteLength > maxBytes) {
      return NextResponse.json(
        { ok: false, code: 'TOO_LARGE', message: 'File too large (max 25MB).' },
        { status: 413 }
      );
    }

    const voiceId = crypto.randomUUID();
    const ext = (() => {
      const n = (file.name || '').toLowerCase();
      if (n.endsWith('.webm')) return 'webm';
      if (n.endsWith('.m4a')) return 'm4a';
      if (n.endsWith('.mp3')) return 'mp3';
      if (n.endsWith('.wav')) return 'wav';
      return 'webm';
    })();

    const storagePath = `projects/${projectId}/voice/${voiceId}.${ext}`;
    const bucket = getAdminStorage().bucket();
    await bucket.file(storagePath).save(Buffer.from(bytes), {
      resumable: false,
      contentType: file.type || 'application/octet-stream',
      metadata: { cacheControl: 'private, max-age=0, no-transform' },
    });

    const { artifactId } = await createVoiceArtifact({
      uid: decoded.uid,
      email: decoded.email ?? null,
      projectId,
      storagePath,
      mimeType: file.type || null,
    });

    return NextResponse.json({
      ok: true,
      artifactId,
      storagePath,
      mimeType: file.type || null,
      sizeBytes: bytes.byteLength,
    });
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
      { ok: false, code: 'VOICE_UPLOAD_FAILED', message: err?.message ?? 'Upload failed.' },
      { status }
    );
  }
}

