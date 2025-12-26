import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { requireAuth, getUserOrgRoles, ensurePersonalBootstrap } = await import(
    "@/lib/auth/server"
  );
  const { getAdminDb } = await import("@/lib/firebase/admin");
  const adminDb = getAdminDb();

  const decoded = await requireAuth(req).catch(() => null);
  if (!decoded) {
    return NextResponse.json(
      { ok: false, code: "UNAUTHENTICATED", message: "Not authenticated." },
      { status: 401 }
    );
  }

  // Ensure there is at least one org/project (personal bootstrap) so the dashboard can function.
  await ensurePersonalBootstrap({ uid: decoded.uid, email: decoded.email ?? null });

  const orgRoles = await getUserOrgRoles(decoded.uid);

  const orgs = await Promise.all(
    orgRoles.map(async ({ orgId, role }) => {
      const orgSnap = await adminDb.doc(`orgs/${orgId}`).get();
      const orgName = (orgSnap.data()?.name as string | undefined) ?? orgId;

      const projectsSnap = await adminDb
        .collection(`orgs/${orgId}/projects`)
        .orderBy("createdAt", "desc")
        .limit(50)
        .get()
        .catch(async () => {
          // If createdAt is missing for older docs, fall back to unordered listing.
          return await adminDb.collection(`orgs/${orgId}/projects`).limit(50).get();
        });

      const projects = projectsSnap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: (data.name as string | undefined) ?? d.id,
          goal: (data.goal as string | undefined) ?? null,
        };
      });

      return { id: orgId, name: orgName, role, projects };
    })
  );

  return NextResponse.json({ ok: true, orgs });
}

