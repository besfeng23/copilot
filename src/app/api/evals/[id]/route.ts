import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

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

const ParamsSchema = z.object({ id: z.string().min(1) });

export async function GET(req: Request, ctx: { params: { id?: string } }) {
  const decoded = await requireAuth(req).catch((err: unknown) => {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 401;
    return jsonError("UNAUTHENTICATED", "Not authenticated.", status);
  });
  if (decoded instanceof NextResponse) return decoded;

  const parsedParams = ParamsSchema.safeParse({ id: ctx.params?.id });
  if (!parsedParams.success) {
    return jsonError("BAD_REQUEST", "Missing eval run id.", 400);
  }

  const db = getAdminDb();
  try {
    const orgId = await resolveOrgId(req, decoded.uid, decoded.email ?? null);
    await requireOrgRole(decoded.uid, orgId, { minRole: "viewer" });

    const ref = db.doc(`orgs/${orgId}/evalRuns/${parsedParams.data.id}`);
    const snap = await ref.get();
    if (!snap.exists) {
      return jsonError("NOT_FOUND", "Eval run not found.", 404);
    }
    const data = (snap.data() ?? {}) as Record<string, unknown>;

    const run = {
      id: snap.id,
      datasetId: typeof data.datasetId === "string" ? data.datasetId : null,
      evaluator: typeof data.evaluator === "string" ? data.evaluator : null,
      status: typeof data.status === "string" ? data.status : "unknown",
      createdAt: tsToIso(data.createdAt),
      startedAt: data.startedAt ? tsToIso(data.startedAt) : null,
      finishedAt: data.finishedAt ? tsToIso(data.finishedAt) : null,
      summary: (data.summary as Record<string, unknown> | null | undefined) ?? null,
    };

    return NextResponse.json({ ok: true, orgId, run });
  } catch (err: unknown) {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 400;
    const message = err instanceof Error ? err.message : "Get failed.";
    return jsonError("GET_FAILED", message, status);
  }
}

