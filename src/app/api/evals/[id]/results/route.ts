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

  const limit = parseLimit(req, 50, 100);
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor"); // ISO timestamp cursor (createdAt of last item)

  const db = getAdminDb();
  try {
    const orgId = await resolveOrgId(req, decoded.uid, decoded.email ?? null);
    await requireOrgRole(decoded.uid, orgId, { minRole: "viewer" });

    const runRef = db.doc(`orgs/${orgId}/evalRuns/${parsedParams.data.id}`);
    const runSnap = await runRef.get();
    if (!runSnap.exists) {
      return jsonError("NOT_FOUND", "Eval run not found.", 404);
    }

    let q: FirebaseFirestore.Query = db
      .collection(`orgs/${orgId}/evalRuns/${parsedParams.data.id}/results`)
      .orderBy("createdAt", "desc");

    if (cursor) {
      const dt = new Date(cursor);
      if (Number.isFinite(dt.getTime())) {
        q = q.startAfter(Timestamp.fromDate(dt));
      }
    }

    const snap = await q.limit(limit).get().catch(async () => {
      // Fallback if createdAt isn't queryable (older docs).
      return await db
        .collection(`orgs/${orgId}/evalRuns/${parsedParams.data.id}/results`)
        .limit(limit)
        .get();
    });

    const results = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        itemId: typeof data.itemId === "string" ? data.itemId : null,
        evaluator: typeof data.evaluator === "string" ? data.evaluator : null,
        status: typeof data.status === "string" ? data.status : "unknown",
        pass: "pass" in data ? data.pass : null,
        score: "score" in data ? data.score : null,
        error: typeof data.error === "string" ? data.error : null,
        createdAt: tsToIso(data.createdAt),
      };
    });

    const last = snap.docs[snap.docs.length - 1];
    const nextCursor = last ? tsToIso((last.data() as Record<string, unknown>)?.createdAt) : null;

    return NextResponse.json({
      ok: true,
      orgId,
      runId: parsedParams.data.id,
      results,
      nextCursor,
    });
  } catch (err: unknown) {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 400;
    const message = err instanceof Error ? err.message : "Results failed.";
    return jsonError("RESULTS_FAILED", message, status);
  }
}

