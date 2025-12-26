import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

import { ensurePersonalBootstrap, requireOrgRole, type OrgRole } from '@/lib/auth/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { PlanSchema, type CopilotPlan } from '@/lib/plans/schema';

function tsToIso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v && typeof v === 'object' && 'toDate' in (v as any)) {
    try {
      return (v as any).toDate().toISOString();
    } catch {
      // fall through
    }
  }
  return new Date(0).toISOString();
}

export const IntakeRoleSchema = z.enum(['user', 'assistant']);
export type IntakeRole = z.infer<typeof IntakeRoleSchema>;

export type IntakeMessage = {
  id: string;
  role: IntakeRole;
  text: string;
  createdAt: string;
  createdBy?: { uid: string; email?: string | null };
};

export type Project = {
  id: string;
  orgId: string;
  name: string;
  goal: string | null;
  status: 'draft' | 'active';
  createdAt: string;
  createdBy?: { uid: string; email?: string | null };
  approvedPlanId?: string | null;
};

export type PlanRecord = {
  id: string;
  projectId: string;
  version: number;
  plan: CopilotPlan;
  createdAt: string;
  createdBy?: { uid: string; email?: string | null };
  source: 'chat' | 'voice';
};

export type Artifact = {
  id: string;
  projectId: string;
  planId?: string | null;
  kind: 'prompt' | 'voice' | 'transcript';
  tool?: 'cursor' | 'firebaseStudio' | 'github' | 'vercel' | 'slack';
  createdAt: string;
  createdBy?: { uid: string; email?: string | null };
  // prompt
  prompts?: string[];
  // voice
  storagePath?: string;
  mimeType?: string;
  // transcript
  text?: string;
  voiceArtifactId?: string;
};

const ProjectDocSchema = z.object({
  orgId: z.string().min(1),
  name: z.string().min(1),
  goal: z.string().nullable().optional(),
  status: z.enum(['draft', 'active']).default('draft'),
  createdAt: z.any(),
  createdBy: z
    .object({
      uid: z.string().min(1),
      email: z.string().nullable().optional(),
    })
    .optional(),
  approvedPlanId: z.string().nullable().optional(),
});

const IntakeMessageDocSchema = z.object({
  role: IntakeRoleSchema,
  text: z.string().min(1).max(12000),
  createdAt: z.any(),
  createdBy: z
    .object({
      uid: z.string().min(1),
      email: z.string().nullable().optional(),
    })
    .optional(),
});

const PlanDocSchema = z.object({
  projectId: z.string().min(1),
  version: z.number().int().min(1),
  plan: PlanSchema,
  createdAt: z.any(),
  createdBy: z
    .object({
      uid: z.string().min(1),
      email: z.string().nullable().optional(),
    })
    .optional(),
  source: z.enum(['chat', 'voice']),
});

const ArtifactDocSchema = z.object({
  projectId: z.string().min(1),
  planId: z.string().nullable().optional(),
  kind: z.enum(['prompt', 'voice', 'transcript']),
  tool: z.enum(['cursor', 'firebaseStudio', 'github', 'vercel', 'slack']).optional(),
  createdAt: z.any(),
  createdBy: z
    .object({
      uid: z.string().min(1),
      email: z.string().nullable().optional(),
    })
    .optional(),
  prompts: z.array(z.string()).optional(),
  storagePath: z.string().optional(),
  mimeType: z.string().optional(),
  text: z.string().optional(),
  voiceArtifactId: z.string().optional(),
});

export async function ensureWorkspaceBootstrapForUser(params: { uid: string; email?: string | null }) {
  // Uses the existing “personal org” bootstrap (orgId === uid).
  return await ensurePersonalBootstrap({ uid: params.uid, email: params.email ?? null });
}

export async function createProject(params: {
  uid: string;
  email?: string | null;
  name: string;
  goal?: string | null;
}): Promise<Project> {
  const db = getAdminDb();
  const { orgId } = await ensureWorkspaceBootstrapForUser({ uid: params.uid, email: params.email ?? null });

  await requireOrgRole(params.uid, orgId, { minRole: 'member' });

  const projectRef = db.collection('projects').doc();
  const orgProjectRef = db.doc(`orgs/${orgId}/projects/${projectRef.id}`);

  const doc = {
    orgId,
    name: params.name,
    goal: params.goal ?? null,
    status: 'draft' as const,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: { uid: params.uid, email: params.email ?? null },
    approvedPlanId: null,
  };

  await Promise.all([
    projectRef.set(doc),
    orgProjectRef.set({
      projectId: projectRef.id,
      name: params.name,
      goal: params.goal ?? null,
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);

  const snap = await projectRef.get();
  const parsed = ProjectDocSchema.parse(snap.data());
  return {
    id: projectRef.id,
    orgId: parsed.orgId,
    name: parsed.name,
    goal: (parsed.goal ?? null) as string | null,
    status: parsed.status,
    createdAt: tsToIso((snap.data() as any)?.createdAt),
    createdBy: parsed.createdBy ? { uid: parsed.createdBy.uid, email: parsed.createdBy.email ?? null } : undefined,
    approvedPlanId: parsed.approvedPlanId ?? null,
  };
}

export async function requireProjectAccess(params: {
  uid: string;
  projectId: string;
  minRole?: OrgRole;
}): Promise<{ project: Project; role: OrgRole }> {
  const db = getAdminDb();
  const snap = await db.doc(`projects/${params.projectId}`).get();
  if (!snap.exists) {
    const err = new Error('Project not found.');
    (err as { status?: number }).status = 404;
    throw err;
  }
  const parsed = ProjectDocSchema.parse(snap.data());
  const role = await requireOrgRole(params.uid, parsed.orgId, { minRole: params.minRole ?? 'viewer' });

  const data = snap.data() as any;
  return {
    role,
    project: {
      id: snap.id,
      orgId: parsed.orgId,
      name: parsed.name,
      goal: (parsed.goal ?? null) as string | null,
      status: parsed.status,
      createdAt: tsToIso(data.createdAt),
      createdBy: parsed.createdBy ? { uid: parsed.createdBy.uid, email: parsed.createdBy.email ?? null } : undefined,
      approvedPlanId: parsed.approvedPlanId ?? null,
    },
  };
}

export async function addIntakeMessage(params: {
  uid: string;
  email?: string | null;
  projectId: string;
  role: IntakeRole;
  text: string;
}): Promise<{ id: string }> {
  const db = getAdminDb();
  await requireProjectAccess({ uid: params.uid, projectId: params.projectId, minRole: 'member' });

  const ref = await db.collection(`projects/${params.projectId}/intakeMessages`).add({
    role: params.role,
    text: params.text,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: { uid: params.uid, email: params.email ?? null },
  });
  return { id: ref.id };
}

export async function listIntakeMessages(params: {
  uid: string;
  projectId: string;
  limit?: number;
}): Promise<IntakeMessage[]> {
  const db = getAdminDb();
  await requireProjectAccess({ uid: params.uid, projectId: params.projectId, minRole: 'viewer' });

  const lim = Math.min(Math.max(params.limit ?? 200, 1), 500);
  const snap = await db
    .collection(`projects/${params.projectId}/intakeMessages`)
    .orderBy('createdAt', 'asc')
    .limit(lim)
    .get()
    .catch(async () => {
      // If createdAt missing for older docs, fall back.
      return await db.collection(`projects/${params.projectId}/intakeMessages`).limit(lim).get();
    });

  return snap.docs.map((d) => {
    const data = IntakeMessageDocSchema.parse(d.data());
    return {
      id: d.id,
      role: data.role,
      text: data.text,
      createdAt: tsToIso((d.data() as any)?.createdAt),
      createdBy: data.createdBy ? { uid: data.createdBy.uid, email: data.createdBy.email ?? null } : undefined,
    };
  });
}

export async function createPlan(params: {
  uid: string;
  email?: string | null;
  projectId: string;
  plan: CopilotPlan;
  source: 'chat' | 'voice';
}): Promise<PlanRecord> {
  const db = getAdminDb();
  await requireProjectAccess({ uid: params.uid, projectId: params.projectId, minRole: 'member' });

  // Version is monotonically increasing.
  const plansCol = db.collection(`projects/${params.projectId}/plans`);
  const latestSnap = await plansCol.orderBy('version', 'desc').limit(1).get().catch(() => null);
  const latestVersion = latestSnap?.docs?.[0]?.data()?.version;
  const version = typeof latestVersion === 'number' && Number.isFinite(latestVersion) ? latestVersion + 1 : 1;

  const ref = plansCol.doc();
  await ref.set({
    projectId: params.projectId,
    version,
    plan: params.plan,
    source: params.source,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: { uid: params.uid, email: params.email ?? null },
  });

  const snap = await ref.get();
  const parsed = PlanDocSchema.parse(snap.data());
  return {
    id: ref.id,
    projectId: parsed.projectId,
    version: parsed.version,
    plan: parsed.plan,
    source: parsed.source,
    createdAt: tsToIso((snap.data() as any)?.createdAt),
    createdBy: parsed.createdBy ? { uid: parsed.createdBy.uid, email: parsed.createdBy.email ?? null } : undefined,
  };
}

export async function getPlan(params: {
  uid: string;
  projectId: string;
  planId: string;
}): Promise<PlanRecord> {
  const db = getAdminDb();
  await requireProjectAccess({ uid: params.uid, projectId: params.projectId, minRole: 'viewer' });

  const snap = await db.doc(`projects/${params.projectId}/plans/${params.planId}`).get();
  if (!snap.exists) {
    const err = new Error('Plan not found.');
    (err as { status?: number }).status = 404;
    throw err;
  }
  const parsed = PlanDocSchema.parse(snap.data());
  return {
    id: snap.id,
    projectId: parsed.projectId,
    version: parsed.version,
    plan: parsed.plan,
    createdAt: tsToIso((snap.data() as any)?.createdAt),
    createdBy: parsed.createdBy ? { uid: parsed.createdBy.uid, email: parsed.createdBy.email ?? null } : undefined,
    source: parsed.source,
  };
}

export async function getLatestPlan(params: {
  uid: string;
  projectId: string;
}): Promise<PlanRecord | null> {
  const db = getAdminDb();
  await requireProjectAccess({ uid: params.uid, projectId: params.projectId, minRole: 'viewer' });
  const snap = await db.collection(`projects/${params.projectId}/plans`).orderBy('version', 'desc').limit(1).get();
  const doc = snap.docs[0];
  if (!doc) return null;
  const parsed = PlanDocSchema.parse(doc.data());
  return {
    id: doc.id,
    projectId: parsed.projectId,
    version: parsed.version,
    plan: parsed.plan,
    createdAt: tsToIso((doc.data() as any)?.createdAt),
    createdBy: parsed.createdBy ? { uid: parsed.createdBy.uid, email: parsed.createdBy.email ?? null } : undefined,
    source: parsed.source,
  };
}

export async function approvePlan(params: {
  uid: string;
  projectId: string;
  planId: string;
}): Promise<{ approvedPlanId: string }> {
  const db = getAdminDb();
  await requireProjectAccess({ uid: params.uid, projectId: params.projectId, minRole: 'member' });

  const planSnap = await db.doc(`projects/${params.projectId}/plans/${params.planId}`).get();
  if (!planSnap.exists) {
    const err = new Error('Plan not found.');
    (err as { status?: number }).status = 404;
    throw err;
  }

  await db.doc(`projects/${params.projectId}`).update({
    approvedPlanId: params.planId,
    approvedAt: FieldValue.serverTimestamp(),
    approvedBy: { uid: params.uid },
  });
  return { approvedPlanId: params.planId };
}

export async function writePromptArtifacts(params: {
  uid: string;
  email?: string | null;
  projectId: string;
  planId: string;
  prompts: CopilotPlan['prompts'];
}): Promise<{ artifactIds: Record<string, string> }> {
  const db = getAdminDb();
  await requireProjectAccess({ uid: params.uid, projectId: params.projectId, minRole: 'member' });

  const toolKeys = ['cursor', 'firebaseStudio', 'github', 'vercel', 'slack'] as const;
  const writes = await Promise.all(
    toolKeys.map(async (tool) => {
      const ref = db.collection('artifacts').doc();
      await ref.set({
        projectId: params.projectId,
        planId: params.planId,
        kind: 'prompt',
        tool,
        prompts: params.prompts[tool],
        createdAt: FieldValue.serverTimestamp(),
        createdBy: { uid: params.uid, email: params.email ?? null },
      });
      return { tool, id: ref.id };
    })
  );

  const artifactIds: Record<string, string> = {};
  for (const w of writes) artifactIds[w.tool] = w.id;
  return { artifactIds };
}

export async function createVoiceArtifact(params: {
  uid: string;
  email?: string | null;
  projectId: string;
  storagePath: string;
  mimeType?: string | null;
}): Promise<{ artifactId: string }> {
  const db = getAdminDb();
  await requireProjectAccess({ uid: params.uid, projectId: params.projectId, minRole: 'member' });

  const ref = db.collection('artifacts').doc();
  await ref.set({
    projectId: params.projectId,
    planId: null,
    kind: 'voice',
    storagePath: params.storagePath,
    mimeType: params.mimeType ?? null,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: { uid: params.uid, email: params.email ?? null },
  });
  return { artifactId: ref.id };
}

export async function createTranscriptArtifact(params: {
  uid: string;
  email?: string | null;
  projectId: string;
  voiceArtifactId: string;
  text: string;
}): Promise<{ artifactId: string }> {
  const db = getAdminDb();
  await requireProjectAccess({ uid: params.uid, projectId: params.projectId, minRole: 'member' });

  const ref = db.collection('artifacts').doc();
  await ref.set({
    projectId: params.projectId,
    planId: null,
    kind: 'transcript',
    text: params.text,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: { uid: params.uid, email: params.email ?? null },
    voiceArtifactId: params.voiceArtifactId,
  });
  return { artifactId: ref.id };
}

export async function getArtifact(params: {
  uid: string;
  artifactId: string;
}): Promise<Artifact> {
  const db = getAdminDb();
  const snap = await db.doc(`artifacts/${params.artifactId}`).get();
  if (!snap.exists) {
    const err = new Error('Artifact not found.');
    (err as { status?: number }).status = 404;
    throw err;
  }
  const parsed = ArtifactDocSchema.parse(snap.data());
  await requireProjectAccess({ uid: params.uid, projectId: parsed.projectId, minRole: 'viewer' });

  const data = snap.data() as any;
  return {
    id: snap.id,
    projectId: parsed.projectId,
    planId: parsed.planId ?? null,
    kind: parsed.kind,
    tool: parsed.tool,
    createdAt: tsToIso(data.createdAt),
    createdBy: parsed.createdBy ? { uid: parsed.createdBy.uid, email: parsed.createdBy.email ?? null } : undefined,
    prompts: parsed.prompts,
    storagePath: parsed.storagePath,
    mimeType: parsed.mimeType,
    text: parsed.text,
    voiceArtifactId: parsed.voiceArtifactId,
  };
}

