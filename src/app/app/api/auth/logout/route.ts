import { NextResponse } from "next/server";

import { clearIdTokenCookie } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearIdTokenCookie();
  return NextResponse.json({ ok: true });
}

