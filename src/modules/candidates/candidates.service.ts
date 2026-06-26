import { randomUUID } from 'node:crypto';
import { Prisma, CandidateStatus } from '@prisma/client';
import { prisma } from '../../config/db';
import { uploadObject, getResumeUrl, deleteObject, ResumeDisposition } from '../../config/s3';
import { ApiError } from '../../utils/ApiError';
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
  const exists = await prisma.candidate.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    throw ApiError.notFound('Candidate not found');
  }
  return prisma.candidate.update({
    where: { id },
    data: { status },
    select: { id: true, status: true, updatedAt: true },
  });
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
