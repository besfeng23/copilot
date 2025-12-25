import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/server";
import { getTruthPack } from "@/lib/firestore";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  orgId: z.string().min(1),
  projectId: z.string().min(1),
});

export async function GET(req: Request) {
  const decoded = await requireAuth(req).catch((err: any) => {
    const status = typeof err?.status === "number" ? err.status : 401;
    return NextResponse.json(
      { ok: false, code: "UNAUTHENTICATED", message: "Not authenticated." },
      { status }
    );
  });
  if (decoded instanceof NextResponse) return decoded;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    orgId: url.searchParams.get("orgId"),
    projectId: url.searchParams.get("projectId"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "BAD_REQUEST", message: "Missing orgId/projectId." },
      { status: 400 }
    );
  }

  try {
    const truthPack = await getTruthPack({
      orgId: parsed.data.orgId,
      projectId: parsed.data.projectId,
      uid: decoded.uid,
      minRole: "viewer",
    });
    return NextResponse.json({ ok: true, truthPack });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 400;
    return NextResponse.json(
      { ok: false, code: "READ_FAILED", message: err?.message ?? "Read failed." },
      { status }
    );
  }
}

