import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth, requireOrgRole } from "@/lib/auth/server";
import { MemoryKindSchema, updateTaskItem, writeMemoryItem } from "@/lib/firestore";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  orgId: z.string().min(1),
  projectId: z.string().min(1),
  kind: MemoryKindSchema,
  payload: z.unknown(),
  // Optional update support for tasks only.
  memoryId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const decoded = await requireAuth(req).catch((err: unknown) => {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 401;
    return NextResponse.json(
      { ok: false, code: "UNAUTHENTICATED", message: "Not authenticated." },
      { status }
    );
  });
  if (decoded instanceof NextResponse) return decoded;

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "BAD_REQUEST", message: "Invalid request body." },
      { status: 400 }
    );
  }

  const { orgId, projectId, kind, payload, memoryId } = parsed.data;

  // Role permissions: must be a member (or higher) to write.
  await requireOrgRole(decoded.uid, orgId, { minRole: "member" }).catch((err: unknown) => {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 403;
    throw Object.assign(new Error("Forbidden"), { status });
  });

  // Append-only rules: allow updates ONLY for kind=task.
  if (memoryId && kind !== "task") {
    return NextResponse.json(
      {
        ok: false,
        code: "APPEND_ONLY",
        message: "Updates are only allowed for kind=task.",
      },
      { status: 400 }
    );
  }

  try {
    if (memoryId && kind === "task") {
      await updateTaskItem({
        orgId,
        projectId,
        uid: decoded.uid,
        memoryId,
        payload,
      });
      return NextResponse.json({ ok: true, updated: true, id: memoryId });
    }

    const { id } = await writeMemoryItem({
      orgId,
      projectId,
      uid: decoded.uid,
      email: decoded.email ?? null,
      kind,
      payload,
    });
    return NextResponse.json({ ok: true, created: true, id });
  } catch (err: unknown) {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 400;
    return NextResponse.json(
      {
        ok: false,
        code: "WRITE_FAILED",
        message: err instanceof Error ? err.message : "Write failed.",
      },
      { status }
    );
  }
}

