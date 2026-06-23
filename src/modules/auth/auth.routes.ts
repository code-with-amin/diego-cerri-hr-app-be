import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAdmin } from '../../middleware/auth';
import { loginLimiter } from '../../middleware/rateLimit';
import * as authController from './auth.controller';

export const authRouter = Router();

authRouter.post('/login', loginLimiter, asyncHandler(authController.login));
authRouter.get('/me', requireAdmin, asyncHandler(authController.me));
