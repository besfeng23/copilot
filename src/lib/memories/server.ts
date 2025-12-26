import "server-only";

import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase/admin";
import { requireOrgRole } from "@/lib/auth/server";
import type { CreateMemoryInput, Memory, Person, Tag, UpdateMemoryInput } from "./schema";

function tsToIso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v && typeof v === "object" && "toDate" in (v as any)) {
    try {
      return (v as any).toDate().toISOString();
    } catch {
      // fall through
    }
  }
  return new Date(0).toISOString();
}

function orgPeopleCol(orgId: string) {
  return getAdminDb().collection(`orgs/${orgId}/people`);
}

function orgTagsCol(orgId: string) {
  return getAdminDb().collection(`orgs/${orgId}/tags`);
}

function orgMemoriesCol(orgId: string) {
  return getAdminDb().collection(`orgs/${orgId}/memories`);
}

function parseDocId(doc: DocumentSnapshot): string {
  return doc.id;
}

function parsePerson(doc: FirebaseFirestore.QueryDocumentSnapshot): Person {
  const data = doc.data() as any;
  return {
    id: doc.id,
    name: String(data.name ?? ""),
    aliases: Array.isArray(data.aliases) ? data.aliases.map((x: any) => String(x)) : [],
    createdAt: tsToIso(data.createdAt),
    updatedAt: data.updatedAt ? tsToIso(data.updatedAt) : null,
  };
}

function parseTag(doc: FirebaseFirestore.QueryDocumentSnapshot): Tag {
  const data = doc.data() as any;
  return {
    id: doc.id,
    name: String(data.name ?? ""),
    createdAt: tsToIso(data.createdAt),
    updatedAt: data.updatedAt ? tsToIso(data.updatedAt) : null,
  };
}

function parseMemory(doc: FirebaseFirestore.QueryDocumentSnapshot): Memory {
  const data = doc.data() as any;
  return {
    id: doc.id,
    text: String(data.text ?? ""),
    source: (data.source ?? null) as string | null,
    participants: Array.isArray(data.participants) ? data.participants.map(String) : [],
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    embeddingRef: (data.embeddingRef ?? null) as string | null,
    createdAt: tsToIso(data.createdAt),
    createdBy: data.createdBy
      ? { uid: String(data.createdBy.uid ?? ""), email: (data.createdBy.email ?? null) as string | null }
      : undefined,
    updatedAt: data.updatedAt ? tsToIso(data.updatedAt) : null,
    updatedBy: data.updatedBy
      ? { uid: String(data.updatedBy.uid ?? ""), email: (data.updatedBy.email ?? null) as string | null }
      : null,
    deleted: Boolean(data.deleted ?? false),
    deletedAt: data.deletedAt ? tsToIso(data.deletedAt) : null,
    deletedBy: data.deletedBy
      ? { uid: String(data.deletedBy.uid ?? ""), email: (data.deletedBy.email ?? null) as string | null }
      : null,
  };
}

export async function requireOrgAdmin(params: { uid: string; orgId: string }) {
  return await requireOrgRole(params.uid, params.orgId, { minRole: "admin" });
}

export async function listPeople(params: { uid: string; orgId: string; limit?: number }): Promise<Person[]> {
  await requireOrgAdmin(params);
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 500);
  const snap = await orgPeopleCol(params.orgId).orderBy("name", "asc").limit(limit).get();
  return snap.docs.map(parsePerson);
}

export async function createPerson(params: {
  uid: string;
  email?: string | null;
  orgId: string;
  name: string;
  aliases?: string[];
}): Promise<{ id: string }> {
  await requireOrgAdmin(params);
  const ref = await orgPeopleCol(params.orgId).add({
    name: params.name,
    aliases: params.aliases ?? [],
    createdAt: FieldValue.serverTimestamp(),
    createdBy: { uid: params.uid, email: params.email ?? null },
  });
  return { id: ref.id };
}

export async function listTags(params: { uid: string; orgId: string; limit?: number }): Promise<Tag[]> {
  await requireOrgAdmin(params);
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 500);
  const snap = await orgTagsCol(params.orgId).orderBy("name", "asc").limit(limit).get();
  return snap.docs.map(parseTag);
}

export async function createTag(params: {
  uid: string;
  email?: string | null;
  orgId: string;
  name: string;
}): Promise<{ id: string }> {
  await requireOrgAdmin(params);
  const ref = await orgTagsCol(params.orgId).add({
    name: params.name,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: { uid: params.uid, email: params.email ?? null },
  });
  return { id: ref.id };
}

export async function createMemory(params: {
  uid: string;
  email?: string | null;
  orgId: string;
  input: CreateMemoryInput;
}): Promise<{ id: string }> {
  await requireOrgAdmin(params);
  const ref = await orgMemoriesCol(params.orgId).add({
    text: params.input.text,
    source: params.input.source ?? null,
    participants: params.input.participants ?? [],
    tags: params.input.tags ?? [],
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: { uid: params.uid, email: params.email ?? null },
  });
  return { id: ref.id };
}

export async function updateMemory(params: {
  uid: string;
  email?: string | null;
  orgId: string;
  memoryId: string;
  input: UpdateMemoryInput;
}): Promise<void> {
  await requireOrgAdmin(params);
  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: { uid: params.uid, email: params.email ?? null },
  };
  if (typeof params.input.text === "string") updates.text = params.input.text;
  if (params.input.source !== undefined) updates.source = params.input.source ?? null;
  if (Array.isArray(params.input.participants)) updates.participants = params.input.participants;
  if (Array.isArray(params.input.tags)) updates.tags = params.input.tags;
  if (typeof params.input.deleted === "boolean") updates.deleted = params.input.deleted;

  await orgMemoriesCol(params.orgId).doc(params.memoryId).update(updates);
}

export async function softDeleteMemory(params: {
  uid: string;
  email?: string | null;
  orgId: string;
  memoryId: string;
}): Promise<void> {
  await requireOrgAdmin(params);
  await orgMemoriesCol(params.orgId).doc(params.memoryId).update({
    deleted: true,
    deletedAt: FieldValue.serverTimestamp(),
    deletedBy: { uid: params.uid, email: params.email ?? null },
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: { uid: params.uid, email: params.email ?? null },
  });
}

export async function restoreMemory(params: {
  uid: string;
  email?: string | null;
  orgId: string;
  memoryId: string;
}): Promise<void> {
  await requireOrgAdmin(params);
  await orgMemoriesCol(params.orgId).doc(params.memoryId).update({
    deleted: false,
    deletedAt: null,
    deletedBy: null,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: { uid: params.uid, email: params.email ?? null },
  });
}

export async function getMemory(params: {
  uid: string;
  orgId: string;
  memoryId: string;
}): Promise<Memory | null> {
  await requireOrgAdmin(params);
  const snap = await orgMemoriesCol(params.orgId).doc(params.memoryId).get();
  if (!snap.exists) return null;
  const data = snap.data() as any;
  return {
    id: snap.id,
    text: String(data.text ?? ""),
    source: (data.source ?? null) as string | null,
    participants: Array.isArray(data.participants) ? data.participants.map(String) : [],
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    embeddingRef: (data.embeddingRef ?? null) as string | null,
    createdAt: tsToIso(data.createdAt),
    createdBy: data.createdBy
      ? { uid: String(data.createdBy.uid ?? ""), email: (data.createdBy.email ?? null) as string | null }
      : undefined,
    updatedAt: data.updatedAt ? tsToIso(data.updatedAt) : null,
    updatedBy: data.updatedBy
      ? { uid: String(data.updatedBy.uid ?? ""), email: (data.updatedBy.email ?? null) as string | null }
      : null,
    deleted: Boolean(data.deleted ?? false),
    deletedAt: data.deletedAt ? tsToIso(data.deletedAt) : null,
    deletedBy: data.deletedBy
      ? { uid: String(data.deletedBy.uid ?? ""), email: (data.deletedBy.email ?? null) as string | null }
      : null,
  };
}

export async function listMemories(params: {
  uid: string;
  orgId: string;
  limit?: number;
  cursor?: string | null;
  personId?: string | null;
  tagId?: string | null;
  from?: Date | null;
  to?: Date | null;
  q?: string | null;
  includeDeleted?: boolean;
}): Promise<{ items: Memory[]; nextCursor: string | null }> {
  await requireOrgAdmin(params);

  const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
  const includeDeleted = Boolean(params.includeDeleted);
  const personId = params.personId?.trim() ? params.personId.trim() : null;
  const tagId = params.tagId?.trim() ? params.tagId.trim() : null;
  const q = params.q?.trim() ? params.q.trim().toLowerCase() : null;

  let query: FirebaseFirestore.Query = orgMemoriesCol(params.orgId);

  // Deleted filter (queryable)
  if (!includeDeleted) {
    query = query.where("deleted", "==", false);
  }

  // Array-contains: Firestore only allows one array-contains filter in a query.
  // If both person+tag are provided, we apply ONE in the query and do the other in-memory.
  const useParticipants = Boolean(personId);
  const useTags = Boolean(tagId) && !useParticipants;
  if (useParticipants && personId) query = query.where("participants", "array-contains", personId);
  if (useTags && tagId) query = query.where("tags", "array-contains", tagId);

  // Date range
  if (params.from) query = query.where("createdAt", ">=", params.from);
  if (params.to) query = query.where("createdAt", "<=", params.to);

  query = query.orderBy("createdAt", "desc");

  if (params.cursor) {
    const [msStr, id] = params.cursor.split(":");
    const ms = Number(msStr);
    if (Number.isFinite(ms) && id) {
      const snap = await orgMemoriesCol(params.orgId).doc(id).get();
      if (snap.exists) query = query.startAfter(snap);
    }
  }

  const snap = await query.limit(limit).get();
  let items = snap.docs.map(parseMemory);

  if (useParticipants && tagId) {
    items = items.filter((m) => m.tags.includes(tagId));
  }
  if (useTags && personId) {
    items = items.filter((m) => m.participants.includes(personId));
  }
  if (q) {
    items = items.filter((m) => m.text.toLowerCase().includes(q));
  }

  const last = snap.docs[snap.docs.length - 1] ?? null;
  const lastCreatedAt = last ? (last.data() as any)?.createdAt : null;
  const lastMs =
    lastCreatedAt instanceof Timestamp
      ? lastCreatedAt.toMillis()
      : lastCreatedAt && typeof lastCreatedAt?.toMillis === "function"
        ? lastCreatedAt.toMillis()
        : null;

  const nextCursor = last && typeof lastMs === "number" ? `${lastMs}:${parseDocId(last)}` : null;
  return { items, nextCursor };
}


