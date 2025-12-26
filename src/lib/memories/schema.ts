import { z } from "zod";

export const PersonSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  aliases: z.array(z.string().min(1).max(200)).default([]),
  createdAt: z.string(),
  updatedAt: z.string().nullable().optional(),
});
export type Person = z.infer<typeof PersonSchema>;

export const TagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  createdAt: z.string(),
  updatedAt: z.string().nullable().optional(),
});
export type Tag = z.infer<typeof TagSchema>;

export const MemorySchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(20000),
  source: z.string().max(500).nullable(),
  participants: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string().min(1)).default([]),
  embeddingRef: z.string().nullable().optional(),
  createdAt: z.string(),
  createdBy: z
    .object({ uid: z.string().min(1), email: z.string().email().nullable().optional() })
    .optional(),
  updatedAt: z.string().nullable().optional(),
  updatedBy: z
    .object({ uid: z.string().min(1), email: z.string().email().nullable().optional() })
    .nullable()
    .optional(),
  deleted: z.boolean().default(false),
  deletedAt: z.string().nullable().optional(),
  deletedBy: z
    .object({ uid: z.string().min(1), email: z.string().email().nullable().optional() })
    .nullable()
    .optional(),
});
export type Memory = z.infer<typeof MemorySchema>;

export const CreateMemoryInputSchema = z.object({
  text: z.string().min(1).max(20000),
  source: z.string().max(500).nullable().optional(),
  participants: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string().min(1)).default([]),
});
export type CreateMemoryInput = z.infer<typeof CreateMemoryInputSchema>;

export const UpdateMemoryInputSchema = CreateMemoryInputSchema.partial().extend({
  deleted: z.boolean().optional(),
});
export type UpdateMemoryInput = z.infer<typeof UpdateMemoryInputSchema>;


