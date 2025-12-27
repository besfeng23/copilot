import { NextResponse } from 'next/server';

export type ApiErrorBody = {
  ok: false;
  code: string;
  message: string;
  details?: unknown;
};

export function jsonOk<T extends Record<string, unknown>>(body: T, init?: { status?: number }) {
  return NextResponse.json({ ok: true, ...body }, { status: init?.status ?? 200 });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: unknown
): ReturnType<typeof NextResponse.json> {
  const body: ApiErrorBody = details === undefined ? { ok: false, code, message } : { ok: false, code, message, details };
  return NextResponse.json(body, { status });
}

