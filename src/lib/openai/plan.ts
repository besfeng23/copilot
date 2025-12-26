import 'server-only';

import type OpenAI from 'openai';

import { getOpenAIClient } from '@/lib/openai/server';
import { PlanJsonSchema, PlanSchema, type CopilotPlan } from '@/lib/plans/schema';

function extractResponseText(resp: any): string {
  if (typeof resp?.output_text === 'string' && resp.output_text.trim()) return resp.output_text;
  const maybe = resp?.output?.[0]?.content?.[0]?.text;
  if (typeof maybe === 'string' && maybe.trim()) return maybe;
  const maybe2 = resp?.output?.[0]?.content?.[0]?.content?.text;
  if (typeof maybe2 === 'string' && maybe2.trim()) return maybe2;
  return '';
}

export async function generatePlanFromIntake(params: {
  projectName?: string | null;
  projectGoal?: string | null;
  intakeTranscript: string;
  model?: string;
}): Promise<CopilotPlan> {
  const client = getOpenAIClient();
  const model = params.model ?? process.env.OPENAI_PLAN_MODEL ?? 'gpt-4.1-mini';

  const system = [
    'You are Copilot inside a product dashboard.',
    'Generate a project plan that makes Copilot immediately usable.',
    'Return STRICT JSON ONLY (no markdown, no prose) that matches the provided JSON Schema.',
    'The oneBestNextAction must be timeboxed and executable in a single focused session.',
    'Use evidenceIds to reference short identifiers you invent (e.g. "intake:msg:3", "voice:transcript").',
  ].join('\n');

  const user = JSON.stringify(
    {
      project: {
        name: params.projectName ?? null,
        goal: params.projectGoal ?? null,
      },
      intake: params.intakeTranscript,
    },
    null,
    2
  );

  const resp = await (client as OpenAI).responses.create({
    model,
    temperature: 0.2,
    instructions: system,
    input: user,
    text: {
      format: {
        type: 'json_schema',
        name: PlanJsonSchema.name,
        schema: PlanJsonSchema.schema,
        strict: true,
      },
    },
  });

  const text = extractResponseText(resp);
  if (!text) throw new Error('OpenAI returned empty output.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`OpenAI output was not valid JSON: ${msg}`);
  }

  return PlanSchema.parse(parsed);
}

