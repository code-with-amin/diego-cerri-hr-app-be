import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';

/** 404 fallthrough for unmatched routes. */
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { message: 'Route not found' } });
}

/** Central error handler — normalizes everything to `{ error: { message, details? } }`. */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  // Zod validation errors -> 400 with field details
  if (err instanceof ZodError) {
    const details = err.flatten().fieldErrors;
    console.error(`[${req.method} ${req.path}] Validation error:`, JSON.stringify(details, null, 2));
    res.status(400).json({
      error: { message: 'Validation failed', details },
    });
    return;
  }

  // Multer upload errors (size limit, etc.) -> 400
  if (err instanceof MulterError) {
    console.error(`[${req.method} ${req.path}] Upload error:`, err.message);
    res.status(400).json({ error: { message: `Upload error: ${err.message}` } });
    return;
  }

  if (err instanceof ApiError) {
    console.error(`[${req.method} ${req.path}] ApiError ${err.statusCode}:`, err.message, err.details ?? '');
    res.status(err.statusCode).json({
      error: { message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }

  // Unknown / unexpected
  req.log?.error({ err }, 'Unhandled error');
  console.error(`[${req.method} ${req.path}] Unhandled error:`, err);
  const message =
    env.NODE_ENV === 'production' ? 'Internal server error' : (err as Error)?.message ?? 'Error';
  res.status(500).json({ error: { message } });
}
