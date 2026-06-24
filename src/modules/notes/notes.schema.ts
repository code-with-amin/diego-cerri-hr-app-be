import { z } from 'zod';

export const createNoteSchema = z.object({
  body: z.string().trim().min(1, 'Note body is required.').max(5000),
});

export const updateNoteSchema = z.object({
  body: z.string().trim().min(1, 'Note body is required.').max(5000),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
