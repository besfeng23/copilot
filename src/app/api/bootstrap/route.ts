export const dynamic = "force-dynamic";

import { jsonOk } from '@/app/api/_lib/http';
import { ensurePersonalOrgForCaller } from '@/app/api/_lib/authz';

export async function POST(req: Request) {
  const ctx = await ensurePersonalOrgForCaller(req);
  if (ctx instanceof Response) return ctx;
  return jsonOk({
    orgId: ctx.orgId,
    role: ctx.role,
  });
}


