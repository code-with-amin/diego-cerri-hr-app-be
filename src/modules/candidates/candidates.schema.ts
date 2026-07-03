import { z } from 'zod';
import { CandidateStatus } from '@prisma/client';

/**
 * The public form (`script.js`) submits multipart/form-data with Portuguese keys.
 * All values arrive as strings; checkbox groups arrive as a single string or an
 * array of strings. These helpers normalize that before validation.
 */

// Coerce a possibly-missing/single multipart field into a string[] of non-empty values.
const toStringArray = z.preprocess((val) => {
  if (val == null) return [];
  const arr = Array.isArray(val) ? val : [val];
  return arr.map((v) => String(v).trim()).filter(Boolean);
}, z.array(z.string()));

// Treat empty strings as "not provided".
const optionalString = z.preprocess(
  (val) => (val === '' || val == null ? undefined : String(val)),
  z.string().optional(),
);

const requiredString = z.preprocess(
  (val) => (val == null ? '' : String(val).trim()),
  z.string().min(1),
);

const optionalNumber = z.preprocess(
  (val) => (val === '' || val == null ? undefined : Number(val)),
  z.number().optional(),
);

const optionalDate = z.preprocess(
  (val) => (val === '' || val == null ? undefined : new Date(String(val))),
  z.date().optional(),
);

/**
 * Parse a filter bound into a UTC instant. A date-only value (YYYY-MM-DD) snaps
 * to the start or end of that day in UTC, so `dateFrom`/`dateTo` are interpreted
 * symmetrically regardless of the server's timezone. Full ISO strings pass through.
 */
const dateBoundary = (boundary: 'start' | 'end') =>
  z.preprocess((val) => {
    if (val === '' || val == null) return undefined;
    const s = String(val);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return new Date(`${s}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`);
    }
    return new Date(s);
  }, z.date().optional());

/** Raw form input (English keys from the HTML form), validated. */
export const candidateFormSchema = z.object({
  // Contact
  name: requiredString,
  email: z.preprocess((v) => (v == null ? '' : String(v).trim()), z.string().email()),
  phone: requiredString,
  city: requiredString,
  state: optionalString,
  country: requiredString,
  linkedin: optionalString,
  birthDate: optionalDate,

  // Modality & availability
  modality: toStringArray.refine((a) => a.length > 0, 'Select at least one modality.'),
  hoursPerDay: z.preprocess((v) => Number(v), z.number().int().min(1).max(12)),
  workMode: optionalString,
  startAvailability: optionalString,
  travel: requiredString,

  // Knowledge areas
  areas: toStringArray.refine((a) => a.length > 0, 'Select at least one area.'),
  software: optionalString,
  seniority: optionalString,

  // Experience
  pastWork: requiredString,
  potentialWork: optionalString,
  yearsExperience: optionalNumber.refine(
    (n) => n == null || (n >= 0 && n <= 100),
    'yearsExperience must be between 0 and 100.',
  ),

  // Compensation & notes
  hourlyRate: z.preprocess((v) => Number(v), z.number().nonnegative()),
  monthlyExpectation: optionalNumber.refine(
    (n) => n == null || n >= 0,
    'monthlyExpectation must be >= 0.',
  ),
  notes: optionalString,
});

export type CandidateFormInput = z.infer<typeof candidateFormSchema>;

/** Map validated form input to Prisma `Candidate` create fields. */
export function mapFormToCandidate(input: CandidateFormInput) {
  return {
    name: input.name,
    email: input.email,
    phone: input.phone,
    city: input.city,
    state: input.state ?? null,
    country: input.country,
    linkedinUrl: input.linkedin ?? null,
    birthDate: input.birthDate ?? null,

    employmentTypes: input.modality,
    hoursPerDay: input.hoursPerDay,
    workRegime: input.workMode ?? null,
    availabilityStart: input.startAvailability ?? null,
    travelAvailability: input.travel,

    knowledgeAreas: input.areas,
    softwareSkills: input.software ?? null,
    seniority: input.seniority ?? null,

    workDone: input.pastWork,
    workCapable: input.potentialWork ?? null,
    yearsExperience: input.yearsExperience ?? null,

    hourlyRate: input.hourlyRate,
    monthlyExpectation: input.monthlyExpectation ?? null,
    observations: input.notes ?? null,
    consent: true,
  };
}

/** Query params for the admin candidate list. */
export const listQuerySchema = z.object({
  q: optionalString,
  status: z.nativeEnum(CandidateStatus).optional(),
  dateFrom: dateBoundary('start'),
  dateTo: dateBoundary('end'),
  sort: z.enum(['asc', 'desc']).default('desc'),
  page: z.preprocess((v) => (v == null ? 1 : Number(v)), z.number().int().min(1)).default(1),
  limit: z
    .preprocess((v) => (v == null ? 20 : Number(v)), z.number().int().min(1).max(100))
    .default(20),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

/** Body for updating a candidate's review status. */
export const updateStatusSchema = z.object({
  status: z.nativeEnum(CandidateStatus),
});

/** Disposition for the resume download endpoint. */
export const resumeQuerySchema = z.object({
  disposition: z.enum(['inline', 'attachment']).default('inline'),
});
