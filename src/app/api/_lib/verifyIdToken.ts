import 'server-only';

import type { DecodedIdToken } from 'firebase-admin/auth';

import { adminAuth } from '@/app/api/_lib/firebaseAdmin';

export type VerifyIdTokenErrorCode = 'NO_AUTH' | 'BAD_TOKEN';

export class VerifyIdTokenError extends Error {
  public readonly code: VerifyIdTokenErrorCode;

  constructor(code: VerifyIdTokenErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'VerifyIdTokenError';
    this.code = code;
    // Keep original error for logs without leaking token values.
    (this as unknown as { cause?: unknown }).cause = cause;
  }
}

export async function verifyIdTokenFromAuthHeader(req: Request): Promise<DecodedIdToken> {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header) {
    throw new VerifyIdTokenError('NO_AUTH', 'Missing Authorization header.');
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new VerifyIdTokenError('BAD_TOKEN', 'Authorization header must be in the form: Bearer <token>.');
  }

  const token = match[1]?.trim();
  if (!token) {
    throw new VerifyIdTokenError('BAD_TOKEN', 'Bearer token is empty.');
  }

  try {
    return await adminAuth.verifyIdToken(token);
  } catch (err) {
    throw new VerifyIdTokenError('BAD_TOKEN', 'Invalid or expired ID token.', err);
  }
}

