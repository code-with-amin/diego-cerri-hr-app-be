import { Prisma, TimeEntrySource } from '@prisma/client';
import { prisma } from '../../config/db';
import { ApiError } from '../../utils/ApiError';
import {
  CreateEntryInput,
  EntriesQuery,
  StartSessionInput,
  StopSessionInput,
  SummaryQuery,
  UpdateEntryInput,
} from './tracker.schema';

const MS_PER_HOUR = 3_600_000;

const NO_RATE_MESSAGE =
  'Your contract hourly rate has not been set yet. Please contact your administrator to set it before tracking time.';

/** Resolve the employee's current hourly rate, or reject if HR hasn't set one. */
async function getRateOrThrow(userId: string): Promise<Prisma.Decimal> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { hourlyRate: true },
  });
  if (!user || user.hourlyRate == null) {
    throw ApiError.badRequest(NO_RATE_MESSAGE);
  }
  return user.hourlyRate;
}

/** cost = net hours × rate, rounded to 2 decimals, as a Decimal-friendly string. */
function computeCost(netMs: number, rate: Prisma.Decimal): string {
  const netHours = netMs / MS_PER_HOUR;
  const cost = netHours * Number(rate);
  return cost.toFixed(2);
}

// ── Live session ──────────────────────────────────────────────

export function getActiveSession(userId: string) {
  return prisma.trackerSession.findUnique({ where: { userId } });
}

export async function startSession(userId: string, input: StartSessionInput) {
  const rate = await getRateOrThrow(userId);

  const existing = await prisma.trackerSession.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (existing) {
    throw ApiError.badRequest('A tracking session is already active.');
  }

  const startedAt = input.startedAt ?? new Date();
  if (startedAt.getTime() > Date.now() + 1000) {
    throw ApiError.badRequest('Start time cannot be in the future.');
  }

  return prisma.trackerSession.create({
    data: {
      userId,
      status: 'running',
      startedAt,
      project: input.project,
      client: input.client,
      activityKey: input.activityKey,
      location: input.location,
      entryType: input.entryType,
      observations: input.observations,
      rateSnapshot: rate,
    },
  });
}

async function requireSession(userId: string) {
  const session = await prisma.trackerSession.findUnique({ where: { userId } });
  if (!session) {
    throw ApiError.notFound('No active tracking session.');
  }
  return session;
}

export async function startBreak(userId: string) {
  const session = await requireSession(userId);
  if (session.status === 'paused') {
    throw ApiError.badRequest('Session is already on a break.');
  }
  return prisma.trackerSession.update({
    where: { userId },
    data: { status: 'paused', currentBreakStartedAt: new Date() },
  });
}

export async function resumeSession(userId: string) {
  const session = await requireSession(userId);
  if (session.status !== 'paused' || !session.currentBreakStartedAt) {
    throw ApiError.badRequest('Session is not on a break.');
  }
  const elapsed = Date.now() - session.currentBreakStartedAt.getTime();
  return prisma.trackerSession.update({
    where: { userId },
    data: {
      status: 'running',
      totalBreakMs: session.totalBreakMs + Math.max(0, elapsed),
      breakCount: session.breakCount + 1,
      currentBreakStartedAt: null,
    },
  });
}

export async function stopSession(userId: string, input: StopSessionInput) {
  const session = await requireSession(userId);

  const endedAt = input.endedAt ?? new Date();
  if (endedAt.getTime() <= session.startedAt.getTime()) {
    throw ApiError.badRequest('End time must be after the start time.');
  }

  // Close any in-progress break up to the stop time.
  let totalBreakMs = session.totalBreakMs;
  if (session.status === 'paused' && session.currentBreakStartedAt) {
    totalBreakMs += Math.max(0, endedAt.getTime() - session.currentBreakStartedAt.getTime());
  }

  const netMs = Math.max(0, endedAt.getTime() - session.startedAt.getTime() - totalBreakMs);
  const rate = session.rateSnapshot ?? (await getRateOrThrow(userId));

  const [entry] = await prisma.$transaction([
    prisma.timeEntry.create({
      data: {
        userId,
        project: session.project,
        activityKey: session.activityKey,
        client: session.client,
        location: session.location,
        entryType: session.entryType,
        startedAt: session.startedAt,
        endedAt,
        breakMs: totalBreakMs,
        netMs,
        rate,
        cost: computeCost(netMs, rate),
        notes: session.observations,
        source: TimeEntrySource.TIMER,
      },
    }),
    prisma.trackerSession.delete({ where: { userId } }),
  ]);

  return entry;
}

// ── Completed entries ─────────────────────────────────────────

export async function createEntry(userId: string, input: CreateEntryInput) {
  const rate = await getRateOrThrow(userId);

  if (input.endedAt.getTime() <= input.startedAt.getTime()) {
    throw ApiError.badRequest('End time must be after the start time.');
  }
  const netMs = input.endedAt.getTime() - input.startedAt.getTime() - input.breakMs;
  if (netMs <= 0) {
    throw ApiError.badRequest('Break time cannot exceed the entry duration.');
  }

  return prisma.timeEntry.create({
    data: {
      userId,
      project: input.project,
      activityKey: input.activityKey,
      client: input.client,
      location: input.location,
      entryType: input.entryType,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      breakMs: input.breakMs,
      netMs,
      rate,
      cost: computeCost(netMs, rate),
      notes: input.notes,
      source: TimeEntrySource.MANUAL,
    },
  });
}

export async function listEntries(userId: string, query: EntriesQuery) {
  const where: Prisma.TimeEntryWhereInput = { userId };

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

export async function updateEntry(userId: string, entryId: string, input: UpdateEntryInput) {
  const entry = await prisma.timeEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.userId !== userId) {
    throw ApiError.notFound('Entry not found');
  }

  const startedAt = input.startedAt ?? entry.startedAt;
  const endedAt = input.endedAt ?? entry.endedAt;
  const breakMs = input.breakMs ?? entry.breakMs;

  if (endedAt.getTime() <= startedAt.getTime()) {
    throw ApiError.badRequest('End time must be after the start time.');
  }
  const netMs = endedAt.getTime() - startedAt.getTime() - breakMs;
  if (netMs <= 0) {
    throw ApiError.badRequest('Break time cannot exceed the entry duration.');
  }

  // Preserve the entry's snapshot rate; only net (and thus cost) is recomputed.
  return prisma.timeEntry.update({
    where: { id: entryId },
    data: {
      project: input.project ?? entry.project,
      activityKey: input.activityKey ?? entry.activityKey,
      client: input.client ?? entry.client,
      location: input.location ?? entry.location,
      entryType: input.entryType ?? entry.entryType,
      notes: input.notes ?? entry.notes,
      startedAt,
      endedAt,
      breakMs,
      netMs,
      cost: computeCost(netMs, entry.rate),
    },
  });
}

// ── Dashboard summary ─────────────────────────────────────────

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function getSummary(userId: string, query: SummaryQuery) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6); // rolling 7-day window incl. today

  const windowDays = Math.max(query.days, 7);
  const windowStart = new Date(todayStart);
  windowStart.setDate(windowStart.getDate() - (windowDays - 1));

  const [windowEntries, recent] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { userId, startedAt: { gte: windowStart } },
      orderBy: { startedAt: 'asc' },
    }),
    prisma.timeEntry.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: 5,
    }),
  ]);

  let hoursTodayMs = 0;
  let weekMs = 0;
  let weekCost = 0;
  let weekEntryCount = 0;
  const perDayMs = new Map<string, number>();
  const activityMs = new Map<string, number>();
  const activityCost = new Map<string, number>();

  // Seed the per-day buckets for the requested window so gaps render as 0.
  for (let i = 0; i < query.days; i++) {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - (query.days - 1 - i));
    perDayMs.set(dayKey(d), 0);
  }

  for (const e of windowEntries) {
    const started = new Date(e.startedAt);
    if (started >= todayStart) hoursTodayMs += e.netMs;
    if (started >= weekStart) {
      weekMs += e.netMs;
      weekCost += Number(e.cost);
      weekEntryCount += 1;
    }
    const key = dayKey(started);
    if (perDayMs.has(key)) perDayMs.set(key, (perDayMs.get(key) ?? 0) + e.netMs);
    activityMs.set(e.activityKey, (activityMs.get(e.activityKey) ?? 0) + e.netMs);
    activityCost.set(e.activityKey, (activityCost.get(e.activityKey) ?? 0) + Number(e.cost));
  }

  const toHours = (ms: number) => Number((ms / MS_PER_HOUR).toFixed(2));

  return {
    hoursToday: toHours(hoursTodayMs),
    weekHours: toHours(weekMs),
    weekCost: weekCost.toFixed(2),
    weekEntryCount,
    perDay: Array.from(perDayMs.entries()).map(([date, ms]) => ({ date, hours: toHours(ms) })),
    activityBreakdown: Array.from(activityMs.entries())
      .map(([activityKey, ms]) => ({
        activityKey,
        hours: toHours(ms),
        cost: (activityCost.get(activityKey) ?? 0).toFixed(2),
      }))
      .sort((a, b) => b.hours - a.hours),
    recent,
  };
}
