import bcrypt from 'bcryptjs';
import { prisma } from '../../config/db';
import { signToken } from '../../middleware/auth';
import { ApiError } from '../../utils/ApiError';
import { LoginInput } from './auth.schema';

export async function login({ email, password }: LoginInput) {
  const admin = await prisma.admin.findUnique({ where: { email } });

  // Compare even when the admin is missing to reduce timing leakage is overkill
  // here; a clear 401 is fine for a single-admin system.
  if (!admin) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  const token = signToken({ sub: admin.id, email: admin.email });
  return { token, admin: { id: admin.id, email: admin.email } };
}

export async function getAdminById(id: string) {
  const admin = await prisma.admin.findUnique({
    where: { id },
    select: { id: true, email: true, createdAt: true },
  });
  if (!admin) {
    throw ApiError.notFound('Admin not found');
  }
  return admin;
}
