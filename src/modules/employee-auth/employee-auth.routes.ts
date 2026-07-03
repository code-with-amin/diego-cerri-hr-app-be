import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireEmployee } from '../../middleware/auth';
import { loginLimiter } from '../../middleware/rateLimit';
import * as employeeAuthController from './employee-auth.controller';

export const employeeAuthRouter = Router();

employeeAuthRouter.post('/login', loginLimiter, asyncHandler(employeeAuthController.login));
employeeAuthRouter.get('/me', requireEmployee, asyncHandler(employeeAuthController.me));
employeeAuthRouter.post(
  '/forgot-password',
  loginLimiter,
  asyncHandler(employeeAuthController.forgotPassword),
);
employeeAuthRouter.post(
  '/reset-password',
  loginLimiter,
  asyncHandler(employeeAuthController.resetPassword),
);
