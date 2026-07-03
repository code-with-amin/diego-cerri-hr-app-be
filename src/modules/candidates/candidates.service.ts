import { randomUUID } from 'node:crypto';
import { Prisma, CandidateStatus } from '@prisma/client';
import { prisma } from '../../config/db';
import { uploadObject, getResumeUrl, deleteObject, ResumeDisposition } from '../../config/s3';
import { ApiError } from '../../utils/ApiError';
import { generatePassword, hashPassword } from '../../utils/password';
import { sendApprovalPassword } from '../mail/mail.service';
import { CandidateFormInput, ListQuery, mapFormToCandidate } from './candidates.schema';

interface ResumeFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/** Create a candidate: upload the resume to S3, then insert the row. */
export async function createCandidate(input: CandidateFormInput, file: ResumeFile) {
  const id = randomUUID();
  const key = `resumes/${id}/${randomUUID()}.pdf`;

  await uploadObject({ key, body: file.buffer, contentType: file.mimetype });

  try {
    const candidate = await prisma.candidate.create({
      data: {
        id,
        ...mapFormToCandidate(input),
        resumeS3Key: key,
        resumeFilename: file.originalname,
        resumeContentType: file.mimetype,
        resumeSize: file.size,
      },
    });
    return candidate;
  } catch (err) {
    // Roll back the orphaned S3 object if the DB insert fails.
    await deleteObject(key).catch(() => undefined);
    throw err;
  }
}

/** Paginated, filtered candidate list (resume binary excluded). */
export async function listCandidates(query: ListQuery) {
  const where: Prisma.CandidateWhereInput = {};

  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { email: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  if (query.status) {
    where.status = query.status;
  }
  if (query.dateFrom || query.dateTo) {
    where.createdAt = {};
    if (query.dateFrom) where.createdAt.gte = query.dateFrom;
    if (query.dateTo) where.createdAt.lte = query.dateTo;
  }

  const [data, total] = await Promise.all([
    prisma.candidate.findMany({
      where,
      orderBy: { createdAt: query.sort },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        city: true,
        state: true,
        seniority: true,
        hourlyRate: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.candidate.count({ where }),
  ]);

  return { data, total, page: query.page, limit: query.limit };
}

/** Full candidate profile, including a presigned resume URL. */
export async function getCandidate(id: string) {
  const candidate = await prisma.candidate.findUnique({ where: { id } });
  if (!candidate) {
    throw ApiError.notFound('Candidate not found');
  }

  const resumeUrl = await getResumeUrl(candidate.resumeS3Key, candidate.resumeFilename, 'inline');

  // Don't leak the internal S3 key to clients.
  const { resumeS3Key: _key, ...rest } = candidate;
  return { ...rest, resumeUrl };
}

export async function updateStatus(id: string, status: CandidateStatus) {
  const candidate = await prisma.candidate.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, hourlyRate: true },
  });
  if (!candidate) {
    throw ApiError.notFound('Candidate not found');
  }

  const updated = await prisma.candidate.update({
    where: { id },
    data: { status },
    select: { id: true, status: true, updatedAt: true },
  });

  // First-time approval provisions an employee account (idempotent).
  if (status === CandidateStatus.APPROVED) {
    await provisionEmployeeFromCandidate(candidate);
  }

  return updated;
}

/**
 * Create an employee User for a newly-approved candidate, once.
 * - No-op if this candidate already has a linked user (idempotent) or if the
 *   candidate's email is already taken by another account.
 * - Generates a random password, stores its hash, and emails the plaintext.
 * A mail failure is logged but does not roll back the created account (HR can
 * re-set the password later from the Employees section).
 */
async function provisionEmployeeFromCandidate(candidate: {
  id: string;
  name: string;
  email: string;
  hourlyRate: Prisma.Decimal;
}) {
  const existing = await prisma.user.findUnique({
    where: { candidateId: candidate.id },
    select: { id: true },
  });
  if (existing) return;

  const emailTaken = await prisma.user.findUnique({
    where: { email: candidate.email },
    select: { id: true },
  });
  if (emailTaken) {
    console.warn(
      `[approval] Skipped employee provisioning for candidate ${candidate.id}: ` +
        `email ${candidate.email} is already in use by another account.`,
    );
    return;
  }

  const employeeRole = await prisma.role.findUnique({ where: { name: 'employee' } });
  if (!employeeRole) {
    throw new ApiError(500, 'Employee role is not seeded');
  }

  const password = generatePassword();
  const passwordHash = await hashPassword(password);

  await prisma.user.create({
    data: {
      email: candidate.email,
      name: candidate.name,
      passwordHash,
      passwordSetAt: new Date(),
      roleId: employeeRole.id,
      candidateId: candidate.id,
      hourlyRate: candidate.hourlyRate,
      enabled: true,
    },
  });

  try {
    await sendApprovalPassword(candidate.email, candidate.name, password);
  } catch (err) {
    console.error(`[approval] Failed to email password to ${candidate.email}:`, err);
  }
}

/**
 * Permanently delete a candidate and its related notes (cascade).
 * The resume object in S3 is intentionally left in place.
 */
export async function deleteCandidate(id: string) {
  const exists = await prisma.candidate.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    throw ApiError.notFound('Candidate not found');
  }

  // A candidate provisioned as an employee cannot be deleted — their account
  // (and any tracked time) would be orphaned. Disable the employee instead.
  const linkedEmployee = await prisma.user.findUnique({
    where: { candidateId: id },
    select: { id: true },
  });
  if (linkedEmployee) {
    throw ApiError.badRequest(
      'This candidate has an employee account and cannot be deleted. Disable the employee instead.',
    );
  }

  await prisma.candidate.delete({ where: { id } });
  return { id };
}

/** Presigned URL for viewing/downloading the resume. */
export async function getCandidateResumeUrl(id: string, disposition: ResumeDisposition) {
  const candidate = await prisma.candidate.findUnique({
    where: { id },
    select: { resumeS3Key: true, resumeFilename: true },
  });
  if (!candidate) {
    throw ApiError.notFound('Candidate not found');
  }
  const url = await getResumeUrl(candidate.resumeS3Key, candidate.resumeFilename, disposition);
  return { url, filename: candidate.resumeFilename };
}
