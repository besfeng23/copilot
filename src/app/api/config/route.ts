import { NextResponse } from "next/server";

import { listMissingServerEnv } from "@/lib/env/server";

export const dynamic = "force-dynamic";

export function GET() {
  const missingServerEnv = listMissingServerEnv();
  return NextResponse.json({
    ok: missingServerEnv.length === 0,
    missingServerEnv,
  });
}


