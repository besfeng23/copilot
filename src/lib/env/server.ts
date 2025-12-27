import "server-only";

export const serverEnv = {
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON,
  FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID,
  FIREBASE_SERVICE_ACCOUNT_PROJECT_ID: process.env.FIREBASE_SERVICE_ACCOUNT_PROJECT_ID,
  FIREBASE_ADMIN_CLIENT_EMAIL: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL: process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL,
  FIREBASE_ADMIN_PRIVATE_KEY: process.env.FIREBASE_ADMIN_PRIVATE_KEY,
  FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY,
  FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
} as const;

function firstNonEmpty(...vals: Array<string | undefined>) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length) return v;
  }
  return undefined;
}

function canSatisfyFirebaseAdminFromEnv(): { ok: boolean; missing: string[] } {
  const rawJson =
    firstNonEmpty(serverEnv.FIREBASE_SERVICE_ACCOUNT_JSON) ??
    firstNonEmpty(serverEnv.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON);

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

  const adminOk =
    Boolean(firstNonEmpty(serverEnv.FIREBASE_ADMIN_PROJECT_ID)) &&
    Boolean(firstNonEmpty(serverEnv.FIREBASE_ADMIN_CLIENT_EMAIL)) &&
    Boolean(firstNonEmpty(serverEnv.FIREBASE_ADMIN_PRIVATE_KEY));

  const saOk =
    Boolean(firstNonEmpty(serverEnv.FIREBASE_SERVICE_ACCOUNT_PROJECT_ID)) &&
    Boolean(firstNonEmpty(serverEnv.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL)) &&
    Boolean(firstNonEmpty(serverEnv.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY));

  if (adminOk || saOk) return { ok: true, missing: [] };

  // Requirement: if not satisfied, return only one recommended path (names only).
  return { ok: false, missing: ["FIREBASE_SERVICE_ACCOUNT_JSON"] };
}

export function listMissingServerEnv(): string[] {
  // Names only. Never throw. Never log values.
  const firebaseAdmin = canSatisfyFirebaseAdminFromEnv();
  return firebaseAdmin.ok ? [] : firebaseAdmin.missing;
}


