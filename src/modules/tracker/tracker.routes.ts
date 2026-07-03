import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireEmployee } from '../../middleware/auth';
import * as trackerController from './tracker.controller';

export const trackerRouter = Router();

// Everything here is employee-only and scoped to the authenticated user.
trackerRouter.use(requireEmployee);

trackerRouter.get('/session/active', asyncHandler(trackerController.activeSession));
trackerRouter.post('/session/start', asyncHandler(trackerController.startSession));
trackerRouter.post('/session/break', asyncHandler(trackerController.breakSession));
trackerRouter.post('/session/resume', asyncHandler(trackerController.resumeSession));
trackerRouter.post('/session/stop', asyncHandler(trackerController.stopSession));

trackerRouter.get('/entries', asyncHandler(trackerController.listEntries));
trackerRouter.post('/entries', asyncHandler(trackerController.createEntry));
trackerRouter.patch('/entries/:id', asyncHandler(trackerController.updateEntry));

trackerRouter.get('/summary', asyncHandler(trackerController.summary));
