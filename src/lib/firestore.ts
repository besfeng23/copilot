import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

import { getAdminDb } from "@/lib/firebase/admin";
import { requireOrgRole, type OrgRole } from "@/lib/auth/server";

export const MemoryKindSchema = z.enum([
  "decision",
  "constraint",
  "summary",
  "audit",
  "artifact",
  "task",
]);
export type MemoryKind = z.infer<typeof MemoryKindSchema>;

const MemoryPayloadSchemaByKind = {
  decision: z.object({ text: z.string().min(1).max(8000) }),
  constraint: z.object({ text: z.string().min(1).max(8000) }),
  summary: z.object({ text: z.string().min(1).max(8000) }),
  audit: z.object({
    action: z.string().min(1).max(4000),
    detail: z.string().max(8000).optional(),
  }),
  artifact: z.object({
    name: z.string().min(1).max(512),
    url: z.string().url().optional(),
    note: z.string().max(8000).optional(),
  }),
  task: z.object({
    title: z.string().min(1).max(512),
    status: z.enum(["open", "done"]).default("open"),
    notes: z.string().max(8000).optional(),
  }),
} satisfies Record<MemoryKind, z.ZodTypeAny>;

export type MemoryPayload<K extends MemoryKind> = z.infer<
  (typeof MemoryPayloadSchemaByKind)[K]
>;

export type MemoryItem<K extends MemoryKind = MemoryKind> = {
  id: string;
  kind: K;
  payload: MemoryPayload<K>;
  createdAt: string;
  createdBy?: { uid: string; email?: string | null };
  updatedAt?: string;
};

export type TruthPack = {
  orgId: string;
  projectId: string;
  latestSummary: MemoryItem<"summary"> | null;
  openTasks: Array<MemoryItem<"task">>;
  recentDecisionsAndConstraints: Array<MemoryItem<"decision" | "constraint">>;
  recentSummaries: Array<MemoryItem<"summary">>;
};

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

function memoryCol(orgId: string, projectId: string) {
  return getAdminDb().collection(`orgs/${orgId}/projects/${projectId}/memory`);
}

function parseMemoryItem(doc: FirebaseFirestore.QueryDocumentSnapshot): MemoryItem {
  const data = doc.data() as Record<string, unknown>;
  const kind = MemoryKindSchema.parse(data.kind);
  const payloadSchema = MemoryPayloadSchemaByKind[kind];
  const payload = payloadSchema.parse(data.payload);

  const createdByRaw = data.createdBy;
  const createdBy =
    createdByRaw && typeof createdByRaw === "object"
      ? {
          uid: String((createdByRaw as { uid?: unknown }).uid ?? ""),
          email:
            typeof (createdByRaw as { email?: unknown }).email === "string"
              ? ((createdByRaw as { email: string }).email as string)
              : null,
        }
      : undefined;
  return {
    id: doc.id,
    kind,
    payload,
    createdAt: tsToIso(data.createdAt),
    createdBy,
    updatedAt: data.updatedAt ? tsToIso(data.updatedAt) : undefined,
  } as MemoryItem;
}

export async function getTruthPack(params: {
  orgId: string;
  projectId: string;
  uid: string;
  minRole?: OrgRole;
  limits?: { recent?: number; summaries?: number; tasks?: number };
}): Promise<TruthPack> {
  const { orgId, projectId, uid } = params;
  await requireOrgRole(uid, orgId, { minRole: params.minRole ?? "viewer" });

  const recentLimit = params.limits?.recent ?? 10;
  const summariesLimit = params.limits?.summaries ?? 5;
  const tasksLimit = params.limits?.tasks ?? 25;

  const col = memoryCol(orgId, projectId);

  const [latestSummarySnap, openTasksSnap, recentDecisionsConstraintsSnap, recentSummariesSnap] =
    await Promise.all([
      col.where("kind", "==", "summary").orderBy("createdAt", "desc").limit(1).get(),
      col.where("kind", "==", "task")
        .where("payload.status", "==", "open")
        .orderBy("createdAt", "desc")
        .limit(tasksLimit)
        .get(),
      col.where("kind", "in", ["decision", "constraint"])
        .orderBy("createdAt", "desc")
        .limit(recentLimit)
        .get(),
      col.where("kind", "==", "summary")
        .orderBy("createdAt", "desc")
        .limit(summariesLimit)
        .get(),
    ]);

  const latestSummaryDoc = latestSummarySnap.docs[0] ?? null;

  return {
    orgId,
    projectId,
    latestSummary: latestSummaryDoc ? (parseMemoryItem(latestSummaryDoc) as MemoryItem<"summary">) : null,
    openTasks: openTasksSnap.docs.map((d) => parseMemoryItem(d) as MemoryItem<"task">),
    recentDecisionsAndConstraints: recentDecisionsConstraintsSnap.docs.map(
      (d) => parseMemoryItem(d) as MemoryItem<"decision" | "constraint">
    ),
    recentSummaries: recentSummariesSnap.docs.map((d) => parseMemoryItem(d) as MemoryItem<"summary">),
  };
}

export async function writeMemoryItem(params: {
  orgId: string;
  projectId: string;
  uid: string;
  email?: string | null;
  kind: MemoryKind;
  payload: unknown;
}): Promise<{ id: string }> {
  const { orgId, projectId, uid, email, kind } = params;
  await requireOrgRole(uid, orgId, { minRole: "member" });

  const payloadSchema = MemoryPayloadSchemaByKind[kind];
  const parsedPayload = payloadSchema.parse(params.payload);

  const ref = await memoryCol(orgId, projectId).add({
    kind,
    payload: parsedPayload,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: { uid, email: email ?? null },
  });

  return { id: ref.id };
}

export async function updateTaskItem(params: {
  orgId: string;
  projectId: string;
  uid: string;
  memoryId: string;
  payload: unknown;
}): Promise<void> {
  const { orgId, projectId, uid, memoryId } = params;
  await requireOrgRole(uid, orgId, { minRole: "member" });

  const payloadSchema = MemoryPayloadSchemaByKind.task;
  const parsedPayload = payloadSchema.parse(params.payload);

  const docRef = memoryCol(orgId, projectId).doc(memoryId);
  const snap = await docRef.get();
  if (!snap.exists) {
    const err = new Error("Task not found.");
    (err as { status?: number }).status = 404;
    throw err;
  }
  const snapData = (snap.data() ?? {}) as Record<string, unknown>;
  if (snapData.kind !== "task") {
    const err = new Error("Can only update kind=task.");
    (err as { status?: number }).status = 400;
    throw err;
  }

  await docRef.update({
    payload: parsedPayload,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

