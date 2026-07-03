import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/db';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

export interface AuthPayload {
  sub: string; // user id
  email: string;
  role: string; // role name (admin | employee)
}

/** The authenticated user loaded from the DB for the current request. */
export interface AuthUser {
  id: string;
  email: string;
  role: string;
  enabled: boolean;
  hourlyRate: string | null; // Decimal serialized as string
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // Canonical authenticated user (any role).
      authUser?: AuthUser;
      // Back-compat alias populated for admins (sub = user id).
      admin?: { sub: string; email: string };
    }
  }
}

export function signToken(payload: AuthPayload): string {
  const options: jwt.SignOptions = { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

function verifyBearer(req: Request): AuthPayload {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing or malformed Authorization header');
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    return jwt.verify(token, env.JWT_SECRET) as AuthPayload;
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }
}

/**
 * Role-based guard. Verifies the Bearer JWT, loads the user from the DB and
 * checks that the user is enabled and holds the required role. Attaches the
 * loaded user as `req.authUser` (and `req.admin` for admins, for back-compat).
 *
 * Structured so a granular Permission table can slot in here later without
 * touching call sites.
 */
export function requireRole(roleName: 'admin' | 'employee') {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const decoded = verifyBearer(req);

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      include: { role: true },
    });

    if (!user || !user.enabled) {
      throw ApiError.unauthorized('Account is not active');
    }
    if (user.role.name !== roleName) {
      throw ApiError.forbidden('Insufficient permissions');
    }

    req.authUser = {
      id: user.id,
      email: user.email,
      role: user.role.name,
      enabled: user.enabled,
      hourlyRate: user.hourlyRate ? user.hourlyRate.toString() : null,
    };
    if (user.role.name === 'admin') {
      req.admin = { sub: user.id, email: user.email };
    }
    next();
  });
}

export const requireAdmin = requireRole('admin');
export const requireEmployee = requireRole('employee');
