import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';
import { ApiError } from '../../utils/ApiError';
import { hashPassword } from '../../utils/password';
import { sendAdminSetPassword } from '../mail/mail.service';
import {
  ListEmployeesQuery,
  SetPasswordInput,
  TimesheetQuery,
  UpdateEmployeeInput,
} from './employees.schema';

const MS_PER_HOUR = 3_600_000;

const employeeSelect = {
  id: true,
  email: true,
  name: true,
  hourlyRate: true,
  enabled: true,
  createdAt: true,
  candidateId: true,
  candidate: {
    select: {
      id: true,
      name: true,
      phone: true,
      city: true,
      state: true,
      country: true,
      seniority: true,
      hourlyRate: true,
    },
  },
} satisfies Prisma.UserSelect;

/** Ensure the target user exists and is an employee. */
async function getEmployeeOrThrow(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!user || user.role.name !== 'employee') {
    throw ApiError.notFound('Employee not found');
  }
  return user;
}

export async function listEmployees(query: ListEmployeesQuery) {
  const where: Prisma.UserWhereInput = { role: { name: 'employee' } };

  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { email: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  if (query.enabled !== undefined) {
    where.enabled = query.enabled;
  }

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: employeeSelect,
    }),
    prisma.user.count({ where }),
  ]);

  return { data, total, page: query.page, limit: query.limit };
}

export async function getEmployee(id: string) {
  await getEmployeeOrThrow(id);
  return prisma.user.findUnique({ where: { id }, select: employeeSelect });
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput) {
  await getEmployeeOrThrow(id);

  const data: Prisma.UserUpdateInput = {};
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.hourlyRate !== undefined) data.hourlyRate = input.hourlyRate;

  // Changing the rate never rewrites existing time_entries — they keep their snapshot.
  return prisma.user.update({ where: { id }, data, select: employeeSelect });
}

export async function setPassword(id: string, input: SetPasswordInput) {
  const employee = await getEmployeeOrThrow(id);

  const passwordHash = await hashPassword(input.password);
  await prisma.user.update({
    where: { id },
    data: {
      passwordHash,
      passwordSetAt: new Date(),
      // Invalidate any outstanding reset token.
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    },
  });

  let emailed = false;
  try {
    await sendAdminSetPassword(employee.email, employee.name, input.password);
    emailed = true;
  } catch (err) {
    console.error(`[employees] Failed to email new password to ${employee.email}:`, err);
  }

  return { id, emailed, email: employee.email };
}

export async function getTimesheet(id: string, query: TimesheetQuery) {
  const employee = await getEmployeeOrThrow(id);

  const where: Prisma.TimeEntryWhereInput = { userId: id };
  if (query.dateFrom || query.dateTo) {
    where.startedAt = {};
    if (query.dateFrom) where.startedAt.gte = query.dateFrom;
    if (query.dateTo) where.startedAt.lte = query.dateTo;
  }
  if (query.project) where.project = { contains: query.project, mode: 'insensitive' };
  if (query.activityKey) where.activityKey = query.activityKey;

  const [data, total, totals] = await Promise.all([
    prisma.timeEntry.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.timeEntry.count({ where }),
    prisma.timeEntry.aggregate({ where, _sum: { netMs: true, cost: true } }),
  ]);

  return {
    employee: {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      hourlyRate: employee.hourlyRate ? employee.hourlyRate.toString() : null,
      enabled: employee.enabled,
    },
    data,
    total,
    page: query.page,
    limit: query.limit,
    totals: {
      netMs: totals._sum.netMs ?? 0,
      netHours: Number(((totals._sum.netMs ?? 0) / MS_PER_HOUR).toFixed(2)),
      cost: totals._sum.cost ? totals._sum.cost.toString() : '0.00',
    },
  };
}
