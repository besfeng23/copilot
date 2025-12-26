import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { ensurePersonalBootstrap, requireAuth, requireOrgRole } from "@/lib/auth/server";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

const ItemSchema = z.object({
  input: z.unknown(),
  expected: z.unknown().optional(),
  metadata: z.unknown().optional(),
});

const BodySchema = z.object({
  items: z.array(ItemSchema).min(1).max(100),
});

export async function POST(req: Request, ctx: { params: { id?: string } }) {
  const decoded = await requireAuth(req).catch((err: unknown) => {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 401;
    return jsonError("UNAUTHENTICATED", "Not authenticated.", status);
  });
  if (decoded instanceof NextResponse) return decoded;

  const parsedParams = ParamsSchema.safeParse({ id: ctx.params?.id });
  if (!parsedParams.success) {
    return jsonError("BAD_REQUEST", "Missing dataset id.", 400);
  }

  const body = await req.json().catch(() => null);
  const parsedBody = BodySchema.safeParse(body);
  if (!parsedBody.success) {
    return jsonError("BAD_REQUEST", "Invalid request body.", 400);
  }

  const db = getAdminDb();

  try {
    const orgId = await resolveOrgId(req, decoded.uid, decoded.email ?? null);
    await requireOrgRole(decoded.uid, orgId, { minRole: "member" });

    const datasetId = parsedParams.data.id;
    const datasetRef = db.doc(`orgs/${orgId}/datasets/${datasetId}`);
    const datasetSnap = await datasetRef.get();
    const datasetData = (datasetSnap.data() ?? {}) as Record<string, unknown>;
    if (!datasetSnap.exists || datasetData.isDeleted) {
      return jsonError("NOT_FOUND", "Dataset not found.", 404);
    }

    const itemsCol = db.collection(`orgs/${orgId}/datasets/${datasetId}/items`);
    const batch = db.batch();

    const ids: string[] = [];
    for (const item of parsedBody.data.items) {
      const docRef = itemsCol.doc();
      ids.push(docRef.id);
      batch.set(docRef, {
        input: item.input,
        ...(item.expected !== undefined ? { expected: item.expected } : {}),
        ...(item.metadata !== undefined ? { metadata: item.metadata } : {}),
        createdAt: FieldValue.serverTimestamp(),
        createdBy: { uid: decoded.uid, email: decoded.email ?? null },
      });
    }

    batch.update(datasetRef, {
      itemCount: FieldValue.increment(parsedBody.data.items.length),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return NextResponse.json({
      ok: true,
      created: true,
      orgId,
      datasetId,
      createdCount: ids.length,
      ids,
    });
  } catch (err: unknown) {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 400;
    const message = err instanceof Error ? err.message : "Add items failed.";
    return jsonError("ADD_ITEMS_FAILED", message, status);
  }
}

