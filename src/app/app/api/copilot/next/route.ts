import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAuth, requireOrgRole } from "@/lib/auth/server";
import { getTruthPack, type TruthPack } from "@/lib/firestore";
import { getOpenAIClient } from "@/lib/openai/server";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  orgId: z.string().min(1),
  projectId: z.string().min(1),
});

type NextAction = {
  title: string;
  rationale: string;
  requiredWrites: Array<{
    kind: "decision" | "constraint" | "summary" | "audit" | "artifact" | "task";
    // Keep this optional to accommodate model output variance.
    payload?: unknown;
  }>;
};

function deterministicFallback(truthPack: TruthPack): NextAction {
  if (!truthPack.latestSummary) {
    return {
      title: "Write the first project summary",
      rationale: "Without a current summary, decisions and tasks drift. Capture the project’s purpose and current state in one paragraph.",
      requiredWrites: [
        {
          kind: "summary",
          payload: { text: "Summary: <add a 3–6 sentence snapshot of goal, scope, current state, and next milestone>." },
        },
      ],
    };
  }

  if (truthPack.openTasks.length === 0) {
    return {
      title: "Create the first concrete task",
      rationale: "You have context, but no executable work. Add a small task that directly advances the goal.",
      requiredWrites: [
        {
          kind: "task",
          payload: { title: "Define the next shippable milestone (1–2 hours)", status: "open" },
        },
      ],
    };
  }

  const top = truthPack.openTasks[0];
  return {
    title: `Do: ${top.payload.title}`,
    rationale: "The fastest path is to execute the highest-priority open task already in memory.",
    requiredWrites: [
      {
        kind: "audit",
        payload: {
          action: "copilot.next",
          detail: `Selected task ${top.id}: ${top.payload.title}`,
        },
      },
    ],
  };
}

async function tryOpenAI(truthPack: TruthPack): Promise<NextAction | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const client = getOpenAIClient();
  const system = [
    "You are a Copilot that proposes ONE best next action.",
    "Return STRICT JSON only (no markdown) matching:",
    `{ "title": string, "rationale": string, "requiredWrites": [{ "kind": "decision"|"constraint"|"summary"|"audit"|"artifact"|"task", "payload": object }] }`,
    "requiredWrites should be minimal and append-only friendly.",
  ].join("\n");

  const user = JSON.stringify(
    {
      truthPack,
      instruction:
        "Given the truth pack, propose ONE best next action that is specific, small, and high leverage.",
    },
    null,
    2
  );

  try {
    // openai@6 supports chat.completions with this shape.
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const content = resp.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content);
    const validated = z
      .object({
        title: z.string().min(1),
        rationale: z.string().min(1),
        requiredWrites: z
          .array(
            z.object({
              kind: z.enum(["decision", "constraint", "summary", "audit", "artifact", "task"]),
              payload: z.unknown(),
            })
          )
          .default([]),
      })
      .parse(parsed);
    return validated;
  } catch {
    return null;
  }
}

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
      { ok: false, code: "BAD_REQUEST", message: "Missing orgId/projectId." },
      { status: 400 }
    );
  }

  const { orgId, projectId } = parsed.data;

  try {
    await requireOrgRole(decoded.uid, orgId, { minRole: "viewer" });
    const truthPack = await getTruthPack({ orgId, projectId, uid: decoded.uid, minRole: "viewer" });

    const ai = await tryOpenAI(truthPack);
    const nextAction = ai ?? deterministicFallback(truthPack);

    return NextResponse.json({ ok: true, nextAction });
  } catch (err: unknown) {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 400;
    return NextResponse.json(
      {
        ok: false,
        code: "COPILOT_FAILED",
        message: err instanceof Error ? err.message : "Copilot failed.",
      },
      { status }
    );
  }
}

