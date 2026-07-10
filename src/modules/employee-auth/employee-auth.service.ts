import { prisma } from '../../config/db';
import { signToken } from '../../middleware/auth';
import { ApiError } from '../../utils/ApiError';
import {
  comparePassword,
  generateResetToken,
  hashPassword,
  hashResetToken,
} from '../../utils/password';
import { sendPasswordReset } from '../mail/mail.service';
import {
  EmployeeLoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from './employee-auth.schema';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Employee login — requires the `employee` role, enabled, and a set password. */
export async function login({ email, password }: EmployeeLoginInput) {
  const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });

  if (!user || user.role.name !== 'employee' || !user.passwordHash) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  // Only reveal a disabled account once the credentials are proven valid — this
  // avoids leaking account existence to someone guessing emails/passwords.
  if (!user.enabled) {
    throw ApiError.forbidden('Your account has been disabled. Please contact your administrator.');
  }

  const token = signToken({ sub: user.id, email: user.email, role: user.role.name });
  return {
    token,
    employee: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name,
      hourlyRate: user.hourlyRate ? user.hourlyRate.toString() : null,
    },
  };
}

export async function getEmployeeById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });
  if (!user) {
    throw ApiError.notFound('Employee not found');
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.name,
    hourlyRate: user.hourlyRate ? user.hourlyRate.toString() : null,
  };
}

/**
 * Begin a password reset. Always resolves the same way (no account enumeration).
 * When an enabled employee exists, a hashed token is stored and an email sent.
 */
export async function forgotPassword({ email }: ForgotPasswordInput) {
  const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });

  if (user && user.role.name === 'employee' && user.enabled) {
    const { token, tokenHash } = generateResetToken();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetTokenHash: tokenHash,
        resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
    await sendPasswordReset(user.email, user.name, token);
  }
}

/** Complete a password reset with a valid, unexpired token. */
export async function resetPassword({ token, password }: ResetPasswordInput) {
  const tokenHash = hashResetToken(token);
  const user = await prisma.user.findFirst({
    where: {
      resetTokenHash: tokenHash,
      resetTokenExpiresAt: { gt: new Date() },
    },
    include: { role: true },
  });

  if (!user || user.role.name !== 'employee' || !user.enabled) {
    throw ApiError.badRequest('Invalid or expired reset token');
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordSetAt: new Date(),
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    },
  });
}
