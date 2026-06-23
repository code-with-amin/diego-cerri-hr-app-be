import rateLimit from 'express-rate-limit';

/** Throttle login attempts to slow credential-stuffing. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many login attempts, try again later.' } },
});

/** Throttle public candidate submissions to limit spam. */
export const submissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many submissions, try again later.' } },
});
