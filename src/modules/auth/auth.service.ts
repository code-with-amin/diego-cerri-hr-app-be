import bcrypt from 'bcryptjs';
import { prisma } from '../../config/db';
import { signToken } from '../../middleware/auth';
import { ApiError } from '../../utils/ApiError';
import { LoginInput } from './auth.schema';

/** Admin login — authenticates a User holding the `admin` role. */
export async function login({ email, password }: LoginInput) {
  const admin = await prisma.user.findUnique({
    where: { email },
    include: { role: true },
  });

  // A clear 401 is fine for the admin login; require the admin role + a password.
  if (!admin || admin.role.name !== 'admin' || !admin.passwordHash) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  const token = signToken({ sub: admin.id, email: admin.email, role: admin.role.name });
  return { token, admin: { id: admin.id, email: admin.email } };
}

export async function getAdminById(id: string) {
  const admin = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, createdAt: true },
  });
  if (!admin) {
    throw ApiError.notFound('Admin not found');
  }
  return admin;
}
