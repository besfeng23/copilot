import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
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
    return jsonError("BAD_REQUEST", "Missing dataset id.", 400);
  }

  const url = new URL(req.url);
  const itemsLimitRaw = url.searchParams.get("itemsLimit");
  const itemsLimit = Math.min(
    Math.max(Number.parseInt(itemsLimitRaw ?? "25", 10) || 25, 1),
    100
  );

  const db = getAdminDb();

  try {
    const orgId = await resolveOrgId(req, decoded.uid, decoded.email ?? null);
    await requireOrgRole(decoded.uid, orgId, { minRole: "viewer" });

    const datasetRef = db.doc(`orgs/${orgId}/datasets/${parsedParams.data.id}`);
    const datasetSnap = await datasetRef.get();
    if (!datasetSnap.exists) {
      return jsonError("NOT_FOUND", "Dataset not found.", 404);
    }
    const datasetData = (datasetSnap.data() ?? {}) as Record<string, unknown>;
    if (datasetData.isDeleted) {
      return jsonError("NOT_FOUND", "Dataset not found.", 404);
    }

    const itemsSnap = await db
      .collection(`orgs/${orgId}/datasets/${parsedParams.data.id}/items`)
      .orderBy("createdAt", "desc")
      .limit(itemsLimit)
      .get()
      .catch(async () => {
        // Fallback if createdAt missing for older docs.
        return await db
          .collection(`orgs/${orgId}/datasets/${parsedParams.data.id}/items`)
          .limit(itemsLimit)
          .get();
      });

    const dataset = {
      id: datasetSnap.id,
      name: typeof datasetData.name === "string" ? datasetData.name : datasetSnap.id,
      description: typeof datasetData.description === "string" ? datasetData.description : null,
      itemCount: typeof datasetData.itemCount === "number" ? datasetData.itemCount : 0,
      createdAt: tsToIso(datasetData.createdAt),
      updatedAt: datasetData.updatedAt ? tsToIso(datasetData.updatedAt) : null,
    };

    const items = itemsSnap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        input: "input" in data ? data.input : null,
        expected: "expected" in data ? data.expected : null,
        metadata: "metadata" in data ? data.metadata : null,
        createdAt: tsToIso(data.createdAt),
      };
    });

    return NextResponse.json({ ok: true, orgId, dataset, items });
  } catch (err: unknown) {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 400;
    const message = err instanceof Error ? err.message : "Get failed.";
    return jsonError("GET_FAILED", message, status);
  }
}

export async function DELETE(req: Request, ctx: { params: { id?: string } }) {
  const decoded = await requireAuth(req).catch((err: unknown) => {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 401;
    return jsonError("UNAUTHENTICATED", "Not authenticated.", status);
  });
  if (decoded instanceof NextResponse) return decoded;

  const parsedParams = ParamsSchema.safeParse({ id: ctx.params?.id });
  if (!parsedParams.success) {
    return jsonError("BAD_REQUEST", "Missing dataset id.", 400);
  }

  const db = getAdminDb();

  try {
    const orgId = await resolveOrgId(req, decoded.uid, decoded.email ?? null);
    // Conservative: deleting a dataset should require elevated privileges.
    await requireOrgRole(decoded.uid, orgId, { minRole: "admin" });

    const ref = db.doc(`orgs/${orgId}/datasets/${parsedParams.data.id}`);
    const snap = await ref.get();
    if (!snap.exists) {
      return jsonError("NOT_FOUND", "Dataset not found.", 404);
    }
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    if (data.isDeleted) {
      return NextResponse.json({ ok: true, deleted: true, id: parsedParams.data.id, orgId });
    }

    await ref.update({
      isDeleted: true,
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deletedBy: { uid: decoded.uid, email: decoded.email ?? null },
    });

    return NextResponse.json({ ok: true, deleted: true, id: parsedParams.data.id, orgId });
  } catch (err: unknown) {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 400;
    const message = err instanceof Error ? err.message : "Delete failed.";
    return jsonError("DELETE_FAILED", message, status);
  }
}

