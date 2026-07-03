import { z } from 'zod';

export const listEmployeesQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  enabled: z
    .preprocess((v) => (v === '' || v == null ? undefined : v), z.enum(['true', 'false']).optional())
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

export const updateEmployeeSchema = z
  .object({
    enabled: z.boolean().optional(),
    hourlyRate: z.coerce.number().min(0).max(1_000_000).optional(),
  })
  .refine((v) => v.enabled !== undefined || v.hourlyRate !== undefined, {
    message: 'Provide at least one of: enabled, hourlyRate',
  });

export const setPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const optionalDate = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.coerce.date().optional(),
);

export const timesheetQuerySchema = z.object({
  dateFrom: optionalDate,
  dateTo: optionalDate,
  project: z.string().trim().min(1).optional(),
  activityKey: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export type TimesheetQuery = z.infer<typeof timesheetQuerySchema>;
