import 'dotenv/config';
import { PrismaClient, TimeEntrySource, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const EMAIL = process.env.SEED_EMPLOYEE_EMAIL ?? 'brad@mail.com';
const COUNT = Number(process.env.SEED_COUNT ?? 200);

const MS_PER_HOUR = 3_600_000;

// Mirrors ACTIVITY_KEYS in the frontend (src/data/employee-mock.ts).
const ACTIVITY_KEYS = [
  'emp_activity_calculation',
  'emp_activity_flowchart',
  'emp_activity_view',
  'emp_activity_detailing',
  'emp_activity_bom',
  'emp_activity_scanning',
  'emp_activity_bim',
  'emp_activity_compat',
  'emp_activity_docs',
  'emp_activity_meeting',
  'emp_activity_software',
  'emp_activity_review',
  'emp_activity_planning',
  'emp_activity_support',
];
const PROJECTS = [
  'Ponte Rio-Niterói',
  'Edifício Aurora',
  'Metrô Linha 4',
  'Usina Solar Bahia',
  'Terminal Portuário',
  'Residencial Vista Verde',
];
const CLIENTS = [
  'Construtora Andrade',
  'Prefeitura de SP',
  'Vale S.A.',
  'Petrobras',
  'Odebrecht',
  null,
];
const LOCATIONS = ['Escritório', 'Home Office', 'Campo', 'Cliente'];
const ENTRY_TYPES = ['Projeto', 'Manutenção', 'Consultoria', 'Vistoria'];
const SOURCES = [TimeEntrySource.TIMER, TimeEntrySource.MANUAL];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, email: true, hourlyRate: true, role: { select: { name: true } } },
  });
  if (!user) {
    throw new Error(`No user found with email ${EMAIL}. Create/approve the employee first.`);
  }
  if (user.role.name !== 'employee') {
    console.warn(`Warning: ${EMAIL} has role "${user.role.name}", not "employee".`);
  }

  const rate = user.hourlyRate ?? new Prisma.Decimal(85);
  const now = Date.now();

  const rows: Prisma.TimeEntryCreateManyInput[] = [];
  for (let i = 0; i < COUNT; i++) {
    // Spread deterministically across the last ~330 days.
    const daysAgo = Math.floor((i * 330) / COUNT); // 0..329
    const start = new Date(now - daysAgo * 24 * MS_PER_HOUR);
    start.setHours(8 + (i % 8), (i * 7) % 60, 0, 0); // 08:00–15:xx

    const durationMin = 60 + ((i * 37) % 360); // 1h..~7h
    const breakMs = (i % 4) * 15 * 60 * 1000; // 0/15/30/45 min
    const end = new Date(start.getTime() + durationMin * 60 * 1000 + breakMs);
    const netMs = Math.max(0, end.getTime() - start.getTime() - breakMs);
    const cost = ((netMs / MS_PER_HOUR) * Number(rate)).toFixed(2);

    rows.push({
      userId: user.id,
      project: pick(PROJECTS, i),
      activityKey: pick(ACTIVITY_KEYS, i),
      client: pick(CLIENTS, i),
      location: pick(LOCATIONS, i),
      entryType: pick(ENTRY_TYPES, i),
      startedAt: start,
      endedAt: end,
      breakMs,
      netMs,
      rate,
      cost,
      notes: i % 5 === 0 ? `Registro de teste #${i + 1}` : null,
      source: pick(SOURCES, i),
    });
  }

  const result = await prisma.timeEntry.createMany({ data: rows });
  console.log(`Inserted ${result.count} time entries for ${user.email} (rate ${rate.toString()}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
