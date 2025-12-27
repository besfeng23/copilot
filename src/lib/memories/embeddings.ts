import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { requireOrgRole } from "@/lib/auth/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getOpenAIClient } from "@/lib/openai/server";

function memoryDoc(orgId: string, memoryId: string) {
  return getAdminDb().doc(`orgs/${orgId}/memories/${memoryId}`);
}

function embeddingDoc(orgId: string, memoryId: string) {
  return getAdminDb().doc(`orgs/${orgId}/memoryEmbeddings/${memoryId}`);
}

export async function embedMemory(params: {
  uid: string;
  email?: string | null;
  orgId: string;
  memoryId: string;
}): Promise<
  | { ok: true; model: string; dimensions: number }
  | { ok: false; code: "OPENAI_NOT_CONFIGURED" | "NOT_FOUND"; message: string }
> {
  await requireOrgRole(params.uid, params.orgId, { minRole: "admin" });

  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, code: "OPENAI_NOT_CONFIGURED", message: "OPENAI_API_KEY is not set." };
  }

  const memSnap = await memoryDoc(params.orgId, params.memoryId).get();
  if (!memSnap.exists) {
    return { ok: false, code: "NOT_FOUND", message: "Memory not found." };
  }

  const text = String((memSnap.data() as any)?.text ?? "").trim();
  if (!text) {
    return { ok: false, code: "NOT_FOUND", message: "Memory text is empty." };
  }

  const model = process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
  const client = getOpenAIClient();
  const resp = await client.embeddings.create({
    model,
    input: text,
  });
  const embedding = resp.data?.[0]?.embedding ?? null;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error("Embedding generation failed.");
  }

  await embeddingDoc(params.orgId, params.memoryId).set(
    {
      orgId: params.orgId,
      memoryId: params.memoryId,
      model,
      embedding,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: { uid: params.uid, email: params.email ?? null },
    },
    { merge: true }
  );

  await memoryDoc(params.orgId, params.memoryId).set(
    {
      embeddingRef: `orgs/${params.orgId}/memoryEmbeddings/${params.memoryId}`,
      embeddedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: { uid: params.uid, email: params.email ?? null },
    },
    { merge: true }
  );

  return { ok: true, model, dimensions: embedding.length };
}


