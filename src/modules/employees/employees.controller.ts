import { Request, Response } from 'express';
import {
  listEmployeesQuerySchema,
  setPasswordSchema,
  timesheetQuerySchema,
  updateEmployeeSchema,
} from './employees.schema';
import * as employeesService from './employees.service';

export async function list(req: Request, res: Response) {
  const query = listEmployeesQuerySchema.parse(req.query);
  const result = await employeesService.listEmployees(query);
  res.json(result);
}

export async function update(req: Request, res: Response) {
  const input = updateEmployeeSchema.parse(req.body);
  const employee = await employeesService.updateEmployee(req.params.id, input);
  res.json({ employee });
}

export async function remove(req: Request, res: Response) {
  const result = await employeesService.deleteEmployee(req.params.id);
  res.json({ deleted: true, ...result });
}

export async function setPassword(req: Request, res: Response) {
  const input = setPasswordSchema.parse(req.body);
  const result = await employeesService.setPassword(req.params.id, input);
  res.json({ ok: true, ...result });
}

export async function timesheet(req: Request, res: Response) {
  const query = timesheetQuerySchema.parse(req.query);
  const result = await employeesService.getTimesheet(req.params.id, query);
  res.json(result);
}
