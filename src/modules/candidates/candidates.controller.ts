import { Request, Response } from 'express';
import { ApiError } from '../../utils/ApiError';
import {
  candidateFormSchema,
  listQuerySchema,
  updateStatusSchema,
  resumeQuerySchema,
} from './candidates.schema';
import * as candidateService from './candidates.service';

export async function create(req: Request, res: Response) {
  if (!req.file) {
    throw ApiError.badRequest('Resume file (resume) is required.');
  }
  const input = candidateFormSchema.parse(req.body);
  await candidateService.createCandidate(input, req.file);
  res.status(201).json({ message: 'Application submitted successfully.' });
}

export async function list(req: Request, res: Response) {
  const query = listQuerySchema.parse(req.query);
  const result = await candidateService.listCandidates(query);
  res.json(result);
}

export async function getById(req: Request, res: Response) {
  const candidate = await candidateService.getCandidate(req.params.id);
  res.json({ candidate });
}

export async function updateStatus(req: Request, res: Response) {
  const { status } = updateStatusSchema.parse(req.body);
  const candidate = await candidateService.updateStatus(req.params.id, status);
  res.json({ candidate });
}

export async function remove(req: Request, res: Response) {
  const result = await candidateService.deleteCandidate(req.params.id);
  res.json({ deleted: true, ...result });
}

export async function getResume(req: Request, res: Response) {
  const { disposition } = resumeQuerySchema.parse(req.query);
  const result = await candidateService.getCandidateResumeUrl(req.params.id, disposition);
  res.json(result);
}
