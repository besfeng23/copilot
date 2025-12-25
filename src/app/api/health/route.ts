import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    ok: true,
    env: {
      has_NEXT_PUBLIC_FIREBASE_API_KEY: Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
      has_NEXT_PUBLIC_FIREBASE_PROJECT_ID: Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
      has_FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON: Boolean(
        process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON
      ),
      has_OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
    },
  });
}

