import { Request, Response } from 'express';
import { createNoteSchema } from './notes.schema';
import * as notesService from './notes.service';

export async function list(req: Request, res: Response) {
  const notes = await notesService.listNotes(req.params.id);
  res.json({ notes });
}

export async function create(req: Request, res: Response) {
  const { body } = createNoteSchema.parse(req.body);
  const note = await notesService.createNote(req.params.id, req.admin!.sub, body);
  res.status(201).json({ note });
}

export async function remove(req: Request, res: Response) {
  await notesService.deleteNote(req.params.noteId, req.admin!.sub);
  res.status(204).send();
}
