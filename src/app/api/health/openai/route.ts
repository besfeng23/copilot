import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';

function toErrorPayload(err: unknown) {
  if (err && typeof err === 'object') {
    const anyErr = err as {
      status?: unknown;
      code?: unknown;
      message?: unknown;
      name?: unknown;
      error?: unknown;
    };

    const code =
      typeof anyErr.code === 'string'
        ? anyErr.code
        : typeof anyErr.name === 'string'
          ? anyErr.name
          : typeof anyErr.status === 'number'
            ? `HTTP_${anyErr.status}`
            : 'UNKNOWN';

    const message = typeof anyErr.message === 'string' ? anyErr.message : 'Unknown error';
    return { code, message };
  }
  return { code: 'UNKNOWN', message: 'Unknown error' };
}

export async function GET() {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, code: 'MISSING_ENV', message: 'OPENAI_API_KEY is not set' },
        { status: 500 }
      );
    }

    // Client init is local-only; does not expose secrets.
    const client = new OpenAI({ apiKey, timeout: 5000, maxRetries: 0 });

    // Lightweight, token-free API call to verify connectivity + key validity.
    await client.models.list();

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { code, message } = toErrorPayload(err);
    return NextResponse.json({ ok: false, code, message }, { status: 500 });
  }
}

