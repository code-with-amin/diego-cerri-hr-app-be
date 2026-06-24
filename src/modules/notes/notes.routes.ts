import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAdmin } from '../../middleware/auth';
import * as notesController from './notes.controller';

// Nested under /api/candidates/:id/notes — mergeParams exposes :id.
// Admin auth is already applied by the parent candidates router.
export const notesRouter = Router({ mergeParams: true });

notesRouter.get('/', asyncHandler(notesController.list));
notesRouter.post('/', asyncHandler(notesController.create));

// Standalone: /api/notes/:noteId
export const notesStandaloneRouter = Router();

notesStandaloneRouter.patch('/:noteId', requireAdmin, asyncHandler(notesController.update));
notesStandaloneRouter.delete('/:noteId', requireAdmin, asyncHandler(notesController.remove));
