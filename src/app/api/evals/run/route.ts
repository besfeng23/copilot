import { NextResponse } from "next/server";
import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";
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

const BodySchema = z.object({
  datasetId: z.string().min(1),
  evaluator: z.string().min(1).max(128),
  maxItems: z.number().int().min(1).max(200).optional(),
});

export async function POST(req: Request) {
  const decoded = await requireAuth(req).catch((err: unknown) => {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 401;
    return jsonError("UNAUTHENTICATED", "Not authenticated.", status);
  });
  if (decoded instanceof NextResponse) return decoded;

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("BAD_REQUEST", "Invalid request body.", 400);
  }

  const db = getAdminDb();

  try {
    const orgId = await resolveOrgId(req, decoded.uid, decoded.email ?? null);
    await requireOrgRole(decoded.uid, orgId, { minRole: "member" });

    const { datasetId, evaluator } = parsed.data;
    const maxItems = parsed.data.maxItems ?? 50;

    const datasetRef = db.doc(`orgs/${orgId}/datasets/${datasetId}`);
    const datasetSnap = await datasetRef.get();
    const datasetData = (datasetSnap.data() ?? {}) as Record<string, unknown>;
    if (!datasetSnap.exists || datasetData.isDeleted) {
      return jsonError("NOT_FOUND", "Dataset not found.", 404);
    }

    const runRef = db.collection(`orgs/${orgId}/evalRuns`).doc();
    await runRef.set({
      datasetId,
      evaluator,
      status: "running",
      createdAt: FieldValue.serverTimestamp(),
      startedAt: FieldValue.serverTimestamp(),
      createdBy: { uid: decoded.uid, email: decoded.email ?? null },
    });

    // Minimal v1.1 evaluator: create "stub" results for a bounded number of items.
    const itemsSnap = await db
      .collection(`orgs/${orgId}/datasets/${datasetId}/items`)
      .orderBy(FieldPath.documentId(), "asc")
      .limit(maxItems)
      .get();

    const resultsCol = db.collection(`orgs/${orgId}/evalRuns/${runRef.id}/results`);
    const ids: string[] = [];

    // Batch in chunks to avoid Firestore 500-write limit.
    const docs = itemsSnap.docs;
    const chunkSize = 400;
    for (let i = 0; i < docs.length; i += chunkSize) {
      const chunk = docs.slice(i, i + chunkSize);
      const batch = db.batch();
      for (const d of chunk) {
        const data = d.data() as Record<string, unknown>;
        const resultRef = resultsCol.doc();
        ids.push(resultRef.id);
        batch.set(resultRef, {
          itemId: d.id,
          input: "input" in data ? data.input : null,
          expected: "expected" in data ? data.expected : null,
          metadata: "metadata" in data ? data.metadata : null,
          evaluator,
          status: "skipped",
          pass: null,
          score: null,
          error: "EVALUATOR_NOT_IMPLEMENTED",
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }

    await runRef.update({
      status: "succeeded",
      finishedAt: FieldValue.serverTimestamp(),
      summary: {
        totalItems: docs.length,
        evaluated: 0,
        skipped: docs.length,
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    const runSnap = await runRef.get();
    const runData = (runSnap.data() ?? {}) as Record<string, unknown>;

    return NextResponse.json({
      ok: true,
      orgId,
      run: {
        id: runRef.id,
        datasetId,
        evaluator,
        status: typeof runData.status === "string" ? runData.status : "succeeded",
        createdAt: tsToIso(runData.createdAt),
        startedAt: runData.startedAt ? tsToIso(runData.startedAt) : null,
        finishedAt: runData.finishedAt ? tsToIso(runData.finishedAt) : null,
        summary: (runData.summary as Record<string, unknown> | null | undefined) ?? null,
      },
      createdResults: ids.length,
    });
  } catch (err: unknown) {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 400;
    const message = err instanceof Error ? err.message : "Run failed.";
    return jsonError("RUN_FAILED", message, status);
  }
}

