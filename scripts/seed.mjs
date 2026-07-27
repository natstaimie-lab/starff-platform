// Seed realistic sample data for the Starff platform.
// Safe to re-run: it clears seeded tables first (keeps admin users + enquiries).
//   npm run seed
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();
const daysFromNow = (d) => new Date(Date.now() + d * 86400000);
const at = (date, h, m = 0) => {
  const x = new Date(date);
  x.setHours(h, m, 0, 0);
  return x;
};

async function main() {
  console.log('Clearing seeded data…');
  await prisma.timesheet.deleteMany();
  await prisma.invoiceLine.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.application.deleteMany();
  await prisma.jobSkill.deleteMany();
  await prisma.job.deleteMany();
  await prisma.candidateDocument.deleteMany();
  await prisma.candidateSkill.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.user.deleteMany({ where: { role: 'CANDIDATE' } });
  await prisma.clientContact.deleteMany();
  await prisma.clientSite.deleteMany();
  await prisma.client.deleteMany();

  console.log('Creating clients…');
  const clientSpec = [
    { name: 'Amazon Logistics', industry: 'Logistics', city: 'Rugeley', contact: ['Emma', 'Clarke'], site: 'Rugeley Fulfilment' },
    { name: 'DHL Supply Chain', industry: 'Logistics', city: 'Birmingham', contact: ['Raj', 'Sharma'], site: 'Birmingham Depot' },
    { name: 'XPO Logistics', industry: 'Logistics', city: 'Coventry', contact: ['Laura', 'Bennett'], site: 'Coventry Hub' },
    { name: 'B&M Retail', industry: 'Retail', city: 'Speke', contact: ['Tom', 'Fisher'], site: 'Speke Warehouse' },
    { name: 'DPD UK', industry: 'Logistics', city: 'Hinckley', contact: ['Aisha', 'Khan'], site: 'Hinckley Sortation' },
  ];
  const clients = [];
  for (const c of clientSpec) {
    const client = await prisma.client.create({
      data: {
        name: c.name,
        industry: c.industry,
        city: c.city,
        status: 'ACTIVE',
        billingEmail: `accounts@${c.name.toLowerCase().replace(/[^a-z]/g, '')}.co.uk`,
        contacts: {
          create: { firstName: c.contact[0], lastName: c.contact[1], email: `${c.contact[0].toLowerCase()}@${c.name.toLowerCase().replace(/[^a-z]/g, '')}.co.uk`, isPrimary: true },
        },
        sites: { create: { name: c.site, city: c.city } },
      },
      include: { sites: true },
    });
    clients.push(client);
  }

  console.log('Creating candidates…');
  const candSpec = [
    ['Jordan', 'Smith', 'Warehouse Operative', 'Birmingham', 'COMPLIANT'],
    ['Priya', 'Patel', 'Forklift Driver', 'Coventry', 'COMPLIANT'],
    ['Michael', 'Johnson', 'General Labourer', 'Wolverhampton', 'SCREENING'],
    ['Sophie', 'Williams', 'HGV Driver', 'Birmingham', 'COMPLIANT'],
    ['Daniel', 'Brown', 'Production Operative', 'Walsall', 'COMPLIANT'],
    ['Amara', 'Okafor', 'Warehouse Operative', 'Dudley', 'ACTIVE'],
    ['Ryan', 'Kelly', 'Van Driver', 'Solihull', 'NEW'],
    ['Zara', 'Ahmed', 'Picker/Packer', 'Birmingham', 'COMPLIANT'],
  ];
  const candidates = [];
  for (const [first, last, headline, city, status] of candSpec) {
    const userId = randomUUID();
    await prisma.user.create({
      data: { id: userId, email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`, role: 'CANDIDATE', firstName: first, lastName: last },
    });
    const candidate = await prisma.candidate.create({
      data: { userId, firstName: first, lastName: last, headline, city, status },
    });
    candidates.push(candidate);
  }

  console.log('Creating jobs…');
  const jobSpec = [
    { clientIdx: 0, title: 'Warehouse Operative', pay: 13.5, charge: 19.5, openings: 12, status: 'FILLED' },
    { clientIdx: 1, title: 'Forklift Driver', pay: 14.2, charge: 21.0, openings: 8, status: 'FILLED' },
    { clientIdx: 2, title: 'HGV Driver', pay: 16.8, charge: 24.5, openings: 4, status: 'OPEN' },
    { clientIdx: 3, title: 'General Labourer', pay: 12.2, charge: 17.5, openings: 10, status: 'OPEN' },
    { clientIdx: 4, title: 'Van Driver', pay: 13.8, charge: 20.0, openings: 6, status: 'OPEN' },
  ];
  const jobs = [];
  for (const j of jobSpec) {
    const client = clients[j.clientIdx];
    const job = await prisma.job.create({
      data: {
        clientId: client.id,
        siteId: client.sites[0]?.id,
        title: j.title,
        payRate: j.pay,
        chargeRate: j.charge,
        openings: j.openings,
        status: j.status,
        startDate: daysFromNow(1),
      },
    });
    jobs.push(job);
  }

  console.log('Creating shifts…');
  // A mix: some upcoming/confirmed, some completed (which get timesheets).
  const shiftSpec = [
    { jobIdx: 0, candIdx: 0, day: 18, start: 7, end: 15, status: 'COMPLETED' },
    { jobIdx: 0, candIdx: 5, day: 18, start: 7, end: 15, status: 'COMPLETED' },
    { jobIdx: 1, candIdx: 1, day: 19, start: 6, end: 14, status: 'COMPLETED' },
    { jobIdx: 3, candIdx: 4, day: 19, start: 8, end: 16, status: 'COMPLETED' },
    { jobIdx: 2, candIdx: 3, day: 2, start: 7, end: 15, status: 'CONFIRMED' },
    { jobIdx: 0, candIdx: 7, day: 2, start: 7, end: 15, status: 'ASSIGNED' },
    { jobIdx: 4, candIdx: 6, day: 3, start: 8, end: 16, status: 'ASSIGNED' },
    { jobIdx: 3, candIdx: null, day: 3, start: 8, end: 16, status: 'OPEN' },
  ];
  const completedShifts = [];
  for (const s of shiftSpec) {
    const job = jobs[s.jobIdx];
    const cand = s.candIdx === null ? null : candidates[s.candIdx];
    const base = s.status === 'COMPLETED' ? daysFromNow(-s.day) : daysFromNow(s.day);
    const shift = await prisma.shift.create({
      data: {
        jobId: job.id,
        siteId: job.siteId,
        candidateId: cand?.id,
        startAt: at(base, s.start),
        endAt: at(base, s.end),
        breakMinutes: 30,
        payRate: job.payRate,
        chargeRate: job.chargeRate,
        status: s.status,
      },
    });
    if (s.status === 'COMPLETED' && cand) completedShifts.push({ shift, cand });
  }

  console.log('Creating timesheets…');
  for (let i = 0; i < completedShifts.length; i++) {
    const { shift, cand } = completedShifts[i];
    await prisma.timesheet.create({
      data: {
        shiftId: shift.id,
        candidateId: cand.id,
        status: i === 0 ? 'APPROVED' : 'SUBMITTED',
        clockIn: shift.startAt,
        clockOut: shift.endAt,
        breakMinutes: 30,
        hoursWorked: 7.5,
        approvedAt: i === 0 ? new Date() : null,
      },
    });
  }

  console.log('Creating invoices…');
  const invSpec = [
    { clientIdx: 0, number: 'INV-1048', total: 48250, status: 'PAID' },
    { clientIdx: 1, number: 'INV-1047', total: 32180, status: 'PAID' },
    { clientIdx: 2, number: 'INV-1046', total: 27640, status: 'SENT' },
  ];
  for (const v of invSpec) {
    await prisma.invoice.create({
      data: {
        clientId: clients[v.clientIdx].id,
        number: v.number,
        status: v.status,
        periodStart: daysFromNow(-30),
        periodEnd: daysFromNow(-1),
        subtotal: v.total,
        total: v.total,
        dueDate: daysFromNow(14),
      },
    });
  }

  console.log('✅ Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
