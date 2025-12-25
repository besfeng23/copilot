import 'server-only';

import type { DecodedIdToken } from 'firebase-admin/auth';

import { getAuth } from '@/lib/firebase/admin';

export type VerifyIdTokenErrorCode = 'BAD_TOKEN';

export class VerifyIdTokenError extends Error {
  readonly code: VerifyIdTokenErrorCode;

  constructor(code: VerifyIdTokenErrorCode, message: string) {
    super(message);
    this.name = 'VerifyIdTokenError';
    this.code = code;
  }
}

export async function verifyIdToken(idToken: string): Promise<DecodedIdToken> {
  if (!idToken || typeof idToken !== 'string') {
    throw new VerifyIdTokenError('BAD_TOKEN', 'Firebase ID token is missing.');
  }

  try {
    return await getAuth().verifyIdToken(idToken);
  } catch {
    throw new VerifyIdTokenError('BAD_TOKEN', 'Invalid Firebase ID token.');
  }
}

