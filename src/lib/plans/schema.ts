import 'server-only';

import { z } from 'zod';

export const PlanSchema = z
  .object({
    blueprint: z.object({
      sections: z
        .array(
          z.object({
            title: z.string().min(1).max(200),
            bullets: z.array(z.string().min(1).max(400)).max(50),
          })
        )
        .min(1)
        .max(30),
    }),
    roadmap: z.object({
      phases: z
        .array(
          z.object({
            name: z.string().min(1).max(200),
            outcomes: z.array(z.string().min(1).max(400)).min(1).max(20),
            acceptanceCriteria: z.array(z.string().min(1).max(400)).min(1).max(20),
            steps: z.array(z.string().min(1).max(500)).min(1).max(40),
          })
        )
        .min(1)
        .max(20),
    }),
    prompts: z.object({
      cursor: z.array(z.string().min(1).max(4000)).max(100),
      firebaseStudio: z.array(z.string().min(1).max(4000)).max(100),
      github: z.array(z.string().min(1).max(4000)).max(100),
      vercel: z.array(z.string().min(1).max(4000)).max(100),
      slack: z.array(z.string().min(1).max(4000)).max(100),
    }),
    oneBestNextAction: z.object({
      title: z.string().min(1).max(240),
      timeboxMinutes: z.number().int().min(5).max(240),
      steps: z.array(z.string().min(1).max(500)).min(1).max(12),
      evidenceIds: z.array(z.string().min(1).max(200)).max(20),
    }),
  })
  .strict();

export type CopilotPlan = z.infer<typeof PlanSchema>;

// OpenAI `response_format: { type: "json_schema" }` schema.
// Hand-written to avoid extra deps while remaining strict.
export const PlanJsonSchema = {
  name: 'copilot_plan_v1',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['blueprint', 'roadmap', 'prompts', 'oneBestNextAction'],
    properties: {
      blueprint: {
        type: 'object',
        additionalProperties: false,
        required: ['sections'],
        properties: {
          sections: {
            type: 'array',
            minItems: 1,
            maxItems: 30,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'bullets'],
              properties: {
                title: { type: 'string' },
                bullets: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
      roadmap: {
        type: 'object',
        additionalProperties: false,
        required: ['phases'],
        properties: {
          phases: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'outcomes', 'acceptanceCriteria', 'steps'],
              properties: {
                name: { type: 'string' },
                outcomes: { type: 'array', items: { type: 'string' } },
                acceptanceCriteria: { type: 'array', items: { type: 'string' } },
                steps: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
      prompts: {
        type: 'object',
        additionalProperties: false,
        required: ['cursor', 'firebaseStudio', 'github', 'vercel', 'slack'],
        properties: {
          cursor: { type: 'array', items: { type: 'string' } },
          firebaseStudio: { type: 'array', items: { type: 'string' } },
          github: { type: 'array', items: { type: 'string' } },
          vercel: { type: 'array', items: { type: 'string' } },
          slack: { type: 'array', items: { type: 'string' } },
        },
      },
      oneBestNextAction: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'timeboxMinutes', 'steps', 'evidenceIds'],
        properties: {
          title: { type: 'string' },
          timeboxMinutes: { type: 'integer' },
          steps: { type: 'array', items: { type: 'string' } },
          evidenceIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const;

