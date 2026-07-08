import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAdmin } from '../../middleware/auth';
import * as employeesController from './employees.controller';

export const employeesRouter = Router();

// Admin-only employee management.
employeesRouter.use(requireAdmin);

employeesRouter.get('/', asyncHandler(employeesController.list));
employeesRouter.patch('/:id', asyncHandler(employeesController.update));
employeesRouter.delete('/:id', asyncHandler(employeesController.remove));
employeesRouter.post('/:id/password', asyncHandler(employeesController.setPassword));
employeesRouter.get('/:id/timesheet', asyncHandler(employeesController.timesheet));
