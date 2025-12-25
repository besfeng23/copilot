import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

function toErrorPayload(err: unknown) {
  if (err && typeof err === 'object') {
    const anyErr = err as { code?: unknown; message?: unknown; name?: unknown };
    return {
      code:
        typeof anyErr.code === 'string'
          ? anyErr.code
          : typeof anyErr.name === 'string'
            ? anyErr.name
            : 'UNKNOWN',
      message: typeof anyErr.message === 'string' ? anyErr.message : 'Unknown error',
    };
  }
  return { code: 'UNKNOWN', message: 'Unknown error' };
}

export async function GET() {
  try {
    if (!process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON) {
      return NextResponse.json(
        { ok: false, code: 'MISSING_ENV', message: 'FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON is not set' },
        { status: 500 }
      );
    }

    // Trivial read to verify Admin SDK connectivity + permissions.
    await getAdminDb().doc('orgs/default').get();

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { code, message } = toErrorPayload(err);
    return NextResponse.json({ ok: false, code, message }, { status: 500 });
  }
}

