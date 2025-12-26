import { NextResponse } from "next/server";

import {
  FIREBASE_CLIENT_ENV_KEYS,
  type FirebaseClientEnvKey,
} from "@/lib/firebase/client";
import { getFirebaseAdminEnvStatus } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

function getMissingClientEnv(): FirebaseClientEnvKey[] {
  return FIREBASE_CLIENT_ENV_KEYS.filter((k) => {
    const v = process.env[k];
    return typeof v !== "string" || v.trim().length === 0;
  });
}

export function GET() {
  const clientMissing = getMissingClientEnv();
  const server = getFirebaseAdminEnvStatus();

  return NextResponse.json({
    client: { ok: clientMissing.length === 0, missing: clientMissing },
    server,
  });
}

