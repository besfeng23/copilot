import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CLIENT_REQUIRED_KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

function missingClientEnv() {
  return CLIENT_REQUIRED_KEYS.filter((k) => {
    const v = process.env[k];
    return typeof v !== "string" || v.trim().length === 0;
  });
}

function firstNonEmpty(...vals: Array<string | undefined>) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length) return v;
  }
  return undefined;
}

function canSatisfyAdminFromEnv() {
  // JSON is preferred.
  const rawJson =
    firstNonEmpty(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) ??
    firstNonEmpty(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON);

  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as Record<string, unknown>;
      const ok =
        !!parsed &&
        typeof parsed === "object" &&
        typeof parsed.project_id === "string" &&
        parsed.project_id.trim().length > 0 &&
        typeof parsed.client_email === "string" &&
        parsed.client_email.trim().length > 0 &&
        typeof parsed.private_key === "string" &&
        parsed.private_key.trim().length > 0;
      return { ok, missing: ok ? [] : ["FIREBASE_SERVICE_ACCOUNT_JSON"] };
    } catch {
      return { ok: false, missing: ["FIREBASE_SERVICE_ACCOUNT_JSON"] };
    }
  }

  // Split vars: accept either FIREBASE_ADMIN_* or FIREBASE_SERVICE_ACCOUNT_*.
  const projectId = firstNonEmpty(
    process.env.FIREBASE_ADMIN_PROJECT_ID,
    process.env.FIREBASE_SERVICE_ACCOUNT_PROJECT_ID
  );
  const clientEmail = firstNonEmpty(
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL
  );
  const privateKey = firstNonEmpty(
    process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY
  );

  const missing: string[] = [];
  if (!projectId) missing.push("FIREBASE_ADMIN_PROJECT_ID", "FIREBASE_SERVICE_ACCOUNT_PROJECT_ID");
  if (!clientEmail)
    missing.push("FIREBASE_ADMIN_CLIENT_EMAIL", "FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL");
  if (!privateKey)
    missing.push("FIREBASE_ADMIN_PRIVATE_KEY", "FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY");

  if (missing.length) {
    return { ok: false, missing: ["FIREBASE_SERVICE_ACCOUNT_JSON", ...missing] };
  }

  return { ok: true, missing: [] };
}

export function GET() {
  const clientMissing = missingClientEnv();
  const server = canSatisfyAdminFromEnv();

  return NextResponse.json({
    client: { ok: clientMissing.length === 0, missing: clientMissing },
    server: { ok: server.ok, missing: server.missing },
  });
}

