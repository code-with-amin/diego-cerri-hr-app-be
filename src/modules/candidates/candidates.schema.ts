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

// Checkbox: present (truthy / "on" / "true") => true.
const consentField = z.preprocess((val) => {
  if (val === true) return true;
  const s = String(val).toLowerCase();
  return s === 'on' || s === 'true' || s === '1' || s === 'yes' || s === 'sim';
}, z.literal(true, { errorMap: () => ({ message: 'Consent (consentimento) is required.' }) }));

const optionalDate = z.preprocess(
  (val) => (val === '' || val == null ? undefined : new Date(String(val))),
  z.date().optional(),
);

/** Raw form input (Portuguese keys), validated. */
export const candidateFormSchema = z.object({
  nome: requiredString,
  email: z.preprocess((v) => (v == null ? '' : String(v).trim()), z.string().email()),
  telefone: requiredString,
  cidade: requiredString,
  linkedin: optionalString,
  nascimento: optionalDate,

  modalidade: toStringArray.refine((a) => a.length > 0, 'Select at least one modalidade.'),
  horasDia: z.preprocess((v) => Number(v), z.number().int().min(1).max(12)),
  regime: optionalString,
  inicio: optionalString,
  viagem: requiredString,

  areas: toStringArray.refine((a) => a.length > 0, 'Select at least one área.'),
  softwares: optionalString,
  senioridade: optionalString,

  trabalhosExecutados: requiredString,
  trabalhosPode: optionalString,
  anosExp: optionalNumber.refine((n) => n == null || (n >= 0 && n <= 60), 'anosExp out of range.'),

  valorHora: z.preprocess((v) => Number(v), z.number().nonnegative()),
  pretensaoMensal: optionalNumber.refine(
    (n) => n == null || n >= 0,
    'pretensaoMensal must be >= 0.',
  ),
  observacoes: optionalString,
  consentimento: consentField,
});

export type CandidateFormInput = z.infer<typeof candidateFormSchema>;

/** Map validated Portuguese form input to Prisma `Candidate` create fields. */
export function mapFormToCandidate(input: CandidateFormInput) {
  return {
    name: input.nome,
    email: input.email,
    phone: input.telefone,
    city: input.cidade,
    linkedinUrl: input.linkedin ?? null,
    birthDate: input.nascimento ?? null,

    employmentTypes: input.modalidade,
    hoursPerDay: input.horasDia,
    workRegime: input.regime ?? null,
    availabilityStart: input.inicio ?? null,
    travelAvailability: input.viagem,

    knowledgeAreas: input.areas,
    softwareSkills: input.softwares ?? null,
    seniority: input.senioridade ?? null,

    workDone: input.trabalhosExecutados,
    workCapable: input.trabalhosPode ?? null,
    yearsExperience: input.anosExp ?? null,

    hourlyRate: input.valorHora,
    monthlyExpectation: input.pretensaoMensal ?? null,
    observations: input.observacoes ?? null,
    consent: input.consentimento,
  };
}

/** Query params for the admin candidate list. */
export const listQuerySchema = z.object({
  q: optionalString,
  status: z.nativeEnum(CandidateStatus).optional(),
  dateFrom: optionalDate,
  dateTo: optionalDate,
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
