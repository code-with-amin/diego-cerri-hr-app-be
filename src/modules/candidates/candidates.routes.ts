import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAdmin } from '../../middleware/auth';
import { resumeUpload } from '../../middleware/upload';
import { submissionLimiter } from '../../middleware/rateLimit';
import { notesRouter } from '../notes/notes.routes';
import * as candidateController from './candidates.controller';

export const candidatesRouter = Router();

// Public — candidate submission from the "Trabalhe Conosco" form.
candidatesRouter.post(
  '/',
  submissionLimiter,
  resumeUpload,
  (req, _res, next) => {
    console.log(
      '[POST /api/candidates] file:',
      req.file ? `${req.file.originalname} (${req.file.mimetype}, ${req.file.size}B)` : 'MISSING',
      '| body:', req.body,
    );
    next();
  },
  asyncHandler(candidateController.create),
);

// Everything below is admin-only.
candidatesRouter.use(requireAdmin);

candidatesRouter.get('/', asyncHandler(candidateController.list));
candidatesRouter.get('/:id', asyncHandler(candidateController.getById));
candidatesRouter.patch('/:id/status', asyncHandler(candidateController.updateStatus));
candidatesRouter.delete('/:id', asyncHandler(candidateController.remove));
candidatesRouter.get('/:id/resume', asyncHandler(candidateController.getResume));

// Nested private notes: /api/candidates/:id/notes
candidatesRouter.use('/:id/notes', notesRouter);
