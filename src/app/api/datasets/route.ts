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

function parseLimit(req: Request, def: number, max: number) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("limit");
  if (!raw) return def;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

async function resolveOrgId(req: Request, uid: string, email?: string | null) {
  // Ensure caller always has at least one org; this matches existing behavior in /api/projects.
  const bootstrap = await ensurePersonalBootstrap({ uid, email: email ?? null });

  // Optional: allow selecting an org ONLY if the caller is a member.
  const url = new URL(req.url);
  const requestedOrgId = url.searchParams.get("orgId");
  if (requestedOrgId) {
    await requireOrgRole(uid, requestedOrgId, { minRole: "viewer" });
    return requestedOrgId;
  }

  return bootstrap.orgId;
}

const CreateDatasetBodySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(4000).optional(),
});

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

    const snap = await db
      .collection(`orgs/${orgId}/datasets`)
      .where("isDeleted", "==", false)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get()
      .catch(async () => {
        // Back-compat fallback if createdAt missing.
        return await db
          .collection(`orgs/${orgId}/datasets`)
          .where("isDeleted", "==", false)
          .limit(limit)
          .get();
      });

    const datasets = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        name: typeof data.name === "string" ? data.name : d.id,
        description: typeof data.description === "string" ? data.description : null,
        itemCount: typeof data.itemCount === "number" ? data.itemCount : 0,
        createdAt: tsToIso(data.createdAt),
        updatedAt: data.updatedAt ? tsToIso(data.updatedAt) : null,
      };
    });

    return NextResponse.json({ ok: true, orgId, datasets });
  } catch (err: unknown) {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 400;
    const message = err instanceof Error ? err.message : "List failed.";
    return jsonError("LIST_FAILED", message, status);
  }
}

export async function POST(req: Request) {
  const decoded = await requireAuth(req).catch((err: unknown) => {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 401;
    return jsonError("UNAUTHENTICATED", "Not authenticated.", status);
  });
  if (decoded instanceof NextResponse) return decoded;

  const body = await req.json().catch(() => null);
  const parsed = CreateDatasetBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("BAD_REQUEST", "Invalid request body.", 400);
  }

  const db = getAdminDb();

  try {
    const orgId = await resolveOrgId(req, decoded.uid, decoded.email ?? null);
    await requireOrgRole(decoded.uid, orgId, { minRole: "member" });

    const ref = await db.collection(`orgs/${orgId}/datasets`).add({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      isDeleted: false,
      itemCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: { uid: decoded.uid, email: decoded.email ?? null },
    });

    return NextResponse.json({ ok: true, created: true, id: ref.id, orgId });
  } catch (err: unknown) {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 400;
    const message = err instanceof Error ? err.message : "Create failed.";
    return jsonError("CREATE_FAILED", message, status);
  }
}

