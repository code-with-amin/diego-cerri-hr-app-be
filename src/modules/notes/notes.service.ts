import { prisma } from '../../config/db';
import { ApiError } from '../../utils/ApiError';

export async function listNotes(candidateId: string) {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true },
  });
  if (!candidate) {
    throw ApiError.notFound('Candidate not found');
  }

  return prisma.note.findMany({
    where: { candidateId },
    orderBy: { createdAt: 'desc' },
    include: { admin: { select: { id: true, email: true } } },
  });
}

export async function createNote(candidateId: string, adminId: string, body: string) {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true },
  });
  if (!candidate) {
    throw ApiError.notFound('Candidate not found');
  }

  return prisma.note.create({
    data: { candidateId, adminId, body },
    include: { admin: { select: { id: true, email: true } } },
  });
}

/** Update a note body — only its author may edit it. */
export async function updateNote(noteId: string, adminId: string, body: string) {
  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note) {
    throw ApiError.notFound('Note not found');
  }
  if (note.adminId !== adminId) {
    throw ApiError.forbidden('You can only edit your own notes.');
  }
  return prisma.note.update({
    where: { id: noteId },
    data: { body },
    include: { admin: { select: { id: true, email: true } } },
  });
}

/** Delete a note — only its author may remove it. */
export async function deleteNote(noteId: string, adminId: string) {
  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note) {
    throw ApiError.notFound('Note not found');
  }
  if (note.adminId !== adminId) {
    throw ApiError.forbidden('You can only delete your own notes.');
  }
  await prisma.note.delete({ where: { id: noteId } });
}
