import { NextResponse } from "next/server";

import { listMissingPublicEnv } from "@/lib/env/public";
import { listMissingServerEnv } from "@/lib/env/server";

export const dynamic = "force-dynamic";

/**
 * Safe env diagnostics endpoint (NAMES ONLY).
 * - Never returns values
 * - Never throws (always responds JSON)
 */
export function GET() {
  const missingPublicEnv = listMissingPublicEnv();
  const missingServerEnv = listMissingServerEnv();

  return NextResponse.json({
    ok: missingPublicEnv.length === 0 && missingServerEnv.length === 0,
    client: { ok: missingPublicEnv.length === 0, missing: missingPublicEnv },
    server: { ok: missingServerEnv.length === 0, missing: missingServerEnv },
  });
}


