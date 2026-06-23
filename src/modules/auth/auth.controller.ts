import { Request, Response } from 'express';
import { loginSchema } from './auth.schema';
import * as authService from './auth.service';

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input);
  res.json(result);
}

export async function me(req: Request, res: Response) {
  const admin = await authService.getAdminById(req.admin!.sub);
  res.json({ admin });
}
