import { prisma } from '../../config/db';
import { ApiError } from '../../utils/ApiError';

// The Note.author relation (User) is exposed to clients as `admin` so the
// notes API response shape stays exactly as before the Admin→User migration.
const authorInclude = { author: { select: { id: true, email: true } } } as const;

type NoteWithAuthor = {
  author: { id: string; email: string };
  [key: string]: unknown;
};

/** Present a note row to clients with the historic `admin` key. */
function presentNote<T extends NoteWithAuthor>(note: T) {
  const { author, ...rest } = note;
  return { ...rest, admin: author };
}

export async function listNotes(candidateId: string) {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true },
  });
  if (!candidate) {
    throw ApiError.notFound('Candidate not found');
  }

  const notes = await prisma.note.findMany({
    where: { candidateId },
    orderBy: { createdAt: 'desc' },
    include: authorInclude,
  });
  return notes.map(presentNote);
}

export async function createNote(candidateId: string, authorId: string, body: string) {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true },
  });
  if (!candidate) {
    throw ApiError.notFound('Candidate not found');
  }

  const note = await prisma.note.create({
    data: { candidateId, authorId, body },
    include: authorInclude,
  });
  return presentNote(note);
}

/** Update a note body — only its author may edit it. */
export async function updateNote(noteId: string, authorId: string, body: string) {
  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note) {
    throw ApiError.notFound('Note not found');
  }
  if (note.authorId !== authorId) {
    throw ApiError.forbidden('You can only edit your own notes.');
  }
  const updated = await prisma.note.update({
    where: { id: noteId },
    data: { body },
    include: authorInclude,
  });
  return presentNote(updated);
}

/** Delete a note — only its author may remove it. */
export async function deleteNote(noteId: string, authorId: string) {
  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note) {
    throw ApiError.notFound('Note not found');
  }
  if (note.authorId !== authorId) {
    throw ApiError.forbidden('You can only delete your own notes.');
  }
  await prisma.note.delete({ where: { id: noteId } });
}
