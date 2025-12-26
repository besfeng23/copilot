import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

import { ensurePersonalBootstrap, requireAuth, requireOrgRole } from "@/lib/auth/server";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function tsToIso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v && typeof v === "object" && typeof (v as { toDate?: unknown }).toDate === "function") {
    try {
      return (v as { toDate: () => Date }).toDate().toISOString();
    } catch {
      // fall through
    }
  }
  return new Date(0).toISOString();
}

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

function parseLimit(req: Request, def: number, max: number) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("limit");
  if (!raw) return def;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

async function resolveOrgId(req: Request, uid: string, email?: string | null) {
  const bootstrap = await ensurePersonalBootstrap({ uid, email: email ?? null });
  const url = new URL(req.url);
  const requestedOrgId = url.searchParams.get("orgId");
  if (requestedOrgId) {
    await requireOrgRole(uid, requestedOrgId, { minRole: "viewer" });
    return requestedOrgId;
  }
  return bootstrap.orgId;
}

export async function GET(req: Request) {
  const decoded = await requireAuth(req).catch((err: unknown) => {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 401;
    return jsonError("UNAUTHENTICATED", "Not authenticated.", status);
  });
  if (decoded instanceof NextResponse) return decoded;

  const limit = parseLimit(req, 50, 100);
  const db = getAdminDb();

  try {
    const orgId = await resolveOrgId(req, decoded.uid, decoded.email ?? null);
    await requireOrgRole(decoded.uid, orgId, { minRole: "viewer" });

    const snap = await db
      .collection(`orgs/${orgId}/evalRuns`)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get()
      .catch(async () => {
        return await db.collection(`orgs/${orgId}/evalRuns`).limit(limit).get();
      });

    const evalRuns = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        datasetId: typeof data.datasetId === "string" ? data.datasetId : null,
        evaluator: typeof data.evaluator === "string" ? data.evaluator : null,
        status: typeof data.status === "string" ? data.status : "unknown",
        createdAt: tsToIso(data.createdAt),
        startedAt: data.startedAt ? tsToIso(data.startedAt) : null,
        finishedAt: data.finishedAt ? tsToIso(data.finishedAt) : null,
        summary: (data.summary as Record<string, unknown> | null | undefined) ?? null,
      };
    });

    return NextResponse.json({ ok: true, orgId, evalRuns });
  } catch (err: unknown) {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 400;
    const message = err instanceof Error ? err.message : "List failed.";
    return jsonError("LIST_FAILED", message, status);
  }
}

