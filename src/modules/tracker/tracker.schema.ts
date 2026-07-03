import { z } from 'zod';

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v ? v : undefined));

/** Start a live session. `startedAt` may be backdated (must not be in the future). */
export const startSessionSchema = z.object({
  project: z.string().trim().min(1, 'Project is required').max(200),
  client: optionalText,
  activityKey: z.string().trim().min(1, 'Activity is required').max(100),
  location: optionalText,
  entryType: optionalText,
  observations: optionalText,
  startedAt: z.coerce.date().optional(),
});

/** Stop the live session. `endedAt` defaults to now; must be after the start. */
export const stopSessionSchema = z.object({
  endedAt: z.coerce.date().optional(),
});

/** Retroactive / manual completed entry. Server recomputes net + cost. */
export const createEntrySchema = z.object({
  project: z.string().trim().min(1, 'Project is required').max(200),
  client: optionalText,
  activityKey: z.string().trim().min(1, 'Activity is required').max(100),
  location: optionalText,
  entryType: optionalText,
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date(),
  breakMs: z.coerce.number().int().min(0).default(0),
  notes: optionalText,
});

/** Edit an existing entry — any subset of fields; net + cost recomputed. */
export const updateEntrySchema = z.object({
  project: z.string().trim().min(1).max(200).optional(),
  client: optionalText,
  activityKey: z.string().trim().min(1).max(100).optional(),
  location: optionalText,
  entryType: optionalText,
  startedAt: z.coerce.date().optional(),
  endedAt: z.coerce.date().optional(),
  breakMs: z.coerce.number().int().min(0).optional(),
  notes: optionalText,
});

const optionalDate = z
  .preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.date().optional());

export const entriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  dateFrom: optionalDate,
  dateTo: optionalDate,
  project: z.string().trim().min(1).optional(),
  activityKey: z.string().trim().min(1).optional(),
});

export const summaryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});

export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type StopSessionInput = z.infer<typeof stopSessionSchema>;
export type CreateEntryInput = z.infer<typeof createEntrySchema>;
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;
export type EntriesQuery = z.infer<typeof entriesQuerySchema>;
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
