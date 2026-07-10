import 'dotenv/config';
import { PrismaClient, TimeEntrySource } from '@prisma/client';

const prisma = new PrismaClient();
const ok: string[] = [];
const fail: string[] = [];
function check(name: string, cond: boolean, extra = '') {
  (cond ? ok : fail).push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` :: ${extra}` : ''}`);
}

async function main() {
  // Backfill parity: report row count must equal time_entries count.
  const [teCount, repCount] = await Promise.all([
    prisma.timeEntry.count(),
    prisma.timeEntryReport.count(),
  ]);
  check('backfill parity (counts equal)', teCount === repCount, `time_entries=${teCount} report=${repCount}`);

  // Need an employee with a rate to create entries.
  const user = await prisma.user.findFirst({ where: { hourlyRate: { not: null } } });
  if (!user) {
    fail.push('FAIL — no employee with hourlyRate found; cannot run write-path checks');
    return;
  }
  const rate = user.hourlyRate!;

  // 1. INSERT (MANUAL-style) — mirrors on insert.
  const started = new Date('2026-07-08T13:00:00.000Z'); // 10:00 in America/Sao_Paulo (UTC-3)
  const ended = new Date('2026-07-08T15:00:00.000Z');   // 12:00 local; net 2h
  const netMs = ended.getTime() - started.getTime();
  const entry = await prisma.timeEntry.create({
    data: {
      userId: user.id, project: 'VERIFY Ponte X', activityKey: 'emp_activity_calculation',
      client: 'VERIFY Cliente', startedAt: started, endedAt: ended, breakMs: 0, netMs,
      rate, cost: ((netMs / 3_600_000) * Number(rate)).toFixed(2), source: TimeEntrySource.MANUAL,
    },
  });
  let rep = await prisma.timeEntryReport.findUnique({ where: { entryId: entry.id } });
  check('INSERT mirrors row', !!rep);
  check('  net_hours = 2.0', rep ? Number(rep.netHours) === 2 : false, rep ? String(rep.netHours) : '');
  check('  work_date = 2026-07-08 (SP tz)', rep ? rep.workDate.toISOString().slice(0, 10) === '2026-07-08' : false, rep?.workDate.toISOString());
  check('  month_name = Julho', rep?.monthName === 'Julho', rep?.monthName);
  check('  weekday_name = Quarta-feira', rep?.weekdayName === 'Quarta-feira', rep?.weekdayName);
  check('  activity_label resolved (Cálculo)', rep?.activityLabel === 'Cálculo', rep?.activityLabel);
  check('  employee_name snapshotted', rep?.employeeName === user.name, rep?.employeeName ?? 'null');

  // Timezone boundary: 01:00 UTC on the 8th is 22:00 on the 7th in SP.
  const nightStart = new Date('2026-07-08T01:00:00.000Z');
  const nightEnd = new Date('2026-07-08T02:00:00.000Z');
  const night = await prisma.timeEntry.create({
    data: {
      userId: user.id, project: 'VERIFY Night', activityKey: 'emp_activity_bim',
      startedAt: nightStart, endedAt: nightEnd, breakMs: 0, netMs: 3_600_000,
      rate, cost: Number(rate).toFixed(2), source: TimeEntrySource.MANUAL,
    },
  });
  const nrep = await prisma.timeEntryReport.findUnique({ where: { entryId: night.id } });
  check('TZ boundary: 01:00Z -> work_date 2026-07-07', nrep ? nrep.workDate.toISOString().slice(0, 10) === '2026-07-07' : false, nrep?.workDate.toISOString());

  // 2. UPDATE — mirror updates, cost/hours recomputed.
  const newEnded = new Date('2026-07-08T16:00:00.000Z'); // now 3h
  await prisma.timeEntry.update({
    where: { id: entry.id },
    data: { endedAt: newEnded, netMs: newEnded.getTime() - started.getTime(), cost: (3 * Number(rate)).toFixed(2), project: 'VERIFY Ponte X (edited)' },
  });
  rep = await prisma.timeEntryReport.findUnique({ where: { entryId: entry.id } });
  check('UPDATE mirrors net_hours = 3.0', rep ? Number(rep.netHours) === 3 : false, rep ? String(rep.netHours) : '');
  check('UPDATE mirrors project change', rep?.project === 'VERIFY Ponte X (edited)', rep?.project);

  // 3. DELETE — mirror row removed.
  await prisma.timeEntry.delete({ where: { id: entry.id } });
  rep = await prisma.timeEntryReport.findUnique({ where: { entryId: entry.id } });
  check('DELETE removes mirror row', rep === null);

  // Cleanup the night row too.
  await prisma.timeEntry.delete({ where: { id: night.id } });
  const nrep2 = await prisma.timeEntryReport.findUnique({ where: { entryId: night.id } });
  check('DELETE (night) removes mirror row', nrep2 === null);

  // Final parity after churn.
  const [te2, rp2] = await Promise.all([prisma.timeEntry.count(), prisma.timeEntryReport.count()]);
  check('final parity after churn', te2 === rp2, `time_entries=${te2} report=${rp2}`);
}

main()
  .catch((e) => fail.push(`FAIL — threw: ${e?.message ?? e}`))
  .finally(async () => {
    await prisma.$disconnect();
    console.log('\n' + [...ok, ...fail].join('\n'));
    console.log(`\n${fail.length === 0 ? '✅ ALL PASS' : `❌ ${fail.length} FAILED`}  (${ok.length} passed)`);
    process.exit(fail.length === 0 ? 0 : 1);
  });
