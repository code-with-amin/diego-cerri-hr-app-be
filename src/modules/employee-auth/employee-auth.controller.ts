import { Request, Response } from 'express';
import {
  employeeLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './employee-auth.schema';
import * as employeeAuthService from './employee-auth.service';

export async function login(req: Request, res: Response) {
  const input = employeeLoginSchema.parse(req.body);
  const result = await employeeAuthService.login(input);
  res.json(result);
}

export async function me(req: Request, res: Response) {
  const employee = await employeeAuthService.getEmployeeById(req.authUser!.id);
  res.json({ employee });
}

export async function forgotPassword(req: Request, res: Response) {
  const input = forgotPasswordSchema.parse(req.body);
  await employeeAuthService.forgotPassword(input);
  // Always 200 — do not reveal whether the account exists.
  res.json({ ok: true });
}

export async function resetPassword(req: Request, res: Response) {
  const input = resetPasswordSchema.parse(req.body);
  await employeeAuthService.resetPassword(input);
  res.json({ ok: true });
}
