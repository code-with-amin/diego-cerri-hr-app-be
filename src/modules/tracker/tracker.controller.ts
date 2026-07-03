import { Request, Response } from 'express';
import {
  createEntrySchema,
  entriesQuerySchema,
  startSessionSchema,
  stopSessionSchema,
  summaryQuerySchema,
  updateEntrySchema,
} from './tracker.schema';
import * as trackerService from './tracker.service';

function userId(req: Request): string {
  return req.authUser!.id;
}

export async function activeSession(req: Request, res: Response) {
  const session = await trackerService.getActiveSession(userId(req));
  res.json({ session });
}

export async function startSession(req: Request, res: Response) {
  const input = startSessionSchema.parse(req.body);
  const session = await trackerService.startSession(userId(req), input);
  res.status(201).json({ session });
}

export async function breakSession(req: Request, res: Response) {
  const session = await trackerService.startBreak(userId(req));
  res.json({ session });
}

export async function resumeSession(req: Request, res: Response) {
  const session = await trackerService.resumeSession(userId(req));
  res.json({ session });
}

export async function stopSession(req: Request, res: Response) {
  const input = stopSessionSchema.parse(req.body);
  const entry = await trackerService.stopSession(userId(req), input);
  res.status(201).json({ entry });
}

export async function createEntry(req: Request, res: Response) {
  const input = createEntrySchema.parse(req.body);
  const entry = await trackerService.createEntry(userId(req), input);
  res.status(201).json({ entry });
}

export async function listEntries(req: Request, res: Response) {
  const query = entriesQuerySchema.parse(req.query);
  const result = await trackerService.listEntries(userId(req), query);
  res.json(result);
}

export async function updateEntry(req: Request, res: Response) {
  const input = updateEntrySchema.parse(req.body);
  const entry = await trackerService.updateEntry(userId(req), req.params.id, input);
  res.json({ entry });
}

export async function summary(req: Request, res: Response) {
  const query = summaryQuerySchema.parse(req.query);
  const result = await trackerService.getSummary(userId(req), query);
  res.json(result);
}
