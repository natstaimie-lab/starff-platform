/**
 * Demo mode — a fake, signed-in candidate with realistic data, for store
 * screenshots and walkthroughs. DEV BUILDS ONLY (the login button is gated on
 * __DEV__). While on, apiFetch answers from here and never touches the API or
 * database, so nothing a demo user does is written anywhere.
 */
import type {
  CandidateInvitation,
  CandidateProfile,
  Journey,
  Notification,
  Shift,
  Timesheet,
} from '@/lib/types';

let demoOn = false;
export const isDemo = () => demoOn;
export const setDemo = (on: boolean) => {
  demoOn = on;
};

export const DEMO_USER_ID = 'demo-candidate';

// ── Dates relative to "now" so the demo always looks current ──────────────
function at(dayOffset: number, h: number, m = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
/** Monday-based offset of this week's weekday (1=Mon … 7=Sun) from today. */
function thisWeek(dow: number): number {
  const today = new Date().getDay() || 7;
  return dow - today;
}

const CLIENT = { id: 'c1', name: 'Northgate Logistics', addressLine1: 'Unit 4, Trafford Park', city: 'Manchester', postcode: 'M17 1SN' };
const CLIENT2 = { id: 'c2', name: 'Brightwell Foods', addressLine1: 'Brightwell Way', city: 'Salford', postcode: 'M50 2ZE' };

const picker = {
  id: 'j1',
  title: 'Warehouse Operative',
  payRate: 12.6,
  ppe: 'Hi-vis vest and safety boots',
  breakInfo: '30 min unpaid',
  reportingContact: 'Dave at Goods In',
  client: CLIENT,
};
const packer = { id: 'j2', title: 'Food Production Packer', payRate: 12.21, client: CLIENT2 };

function shift(id: string, job: typeof picker | typeof packer, startAt: string, endAt: string, status: Shift['status'], extra: Partial<Shift> = {}): Shift {
  return {
    id,
    status,
    startAt,
    endAt,
    breakMinutes: 30,
    payRate: job.payRate,
    job,
    site: { ...job.client },
    ...extra,
  };
}

// Past shifts this week (or last few days if early in the week).
const pastDays = [thisWeek(1), thisWeek(2), thisWeek(3), thisWeek(4)].filter((d) => d < 0);
while (pastDays.length < 4) pastDays.unshift((pastDays[0] ?? 0) - 1);

const past: Shift[] = pastDays.map((d, i) =>
  shift(`s-past-${i}`, i % 2 ? packer : picker, at(d, 7), at(d, 15, 30), 'COMPLETED', {
    checkInAt: at(d, 6, 52),
    checkOutAt: at(d, 15, 34),
  }),
);
const tsStatus: Timesheet['status'][] = ['PAID', 'APPROVED', 'APPROVED', 'SUBMITTED'];
const timesheets: Timesheet[] = past.map((s, i) => ({
  id: `t-${i}`,
  status: tsStatus[i],
  hoursWorked: 8,
  clockIn: s.checkInAt,
  clockOut: s.checkOutAt,
  shift: s,
}));

const upcoming: Shift[] = [
  shift('s-next', picker, at(1, 7), at(1, 15, 30), 'CONFIRMED', { acknowledgedAt: at(0, 9) }),
  shift('s-next2', packer, at(2, 14), at(2, 22), 'CONFIRMED'),
  shift('s-next3', picker, at(4, 7), at(4, 15, 30), 'ASSIGNED'),
];

const profile: CandidateProfile = {
  id: 'demo-cand',
  userId: DEMO_USER_ID,
  firstName: 'Jordan',
  lastName: 'Ellis',
  phone: '07700 900123',
  city: 'Manchester',
  postcode: 'M16 0RA',
  status: 'ACTIVE',
  available: true,
  headline: 'Warehouse & food production · forklift trained',
  rightToWorkType: 'British citizen',
  documents: [
    { id: 'd1', type: 'RIGHT_TO_WORK', status: 'VERIFIED', fileName: 'passport.jpg' },
    { id: 'd2', type: 'ID', status: 'VERIFIED', fileName: 'driving-licence.jpg' },
    { id: 'd3', type: 'CV', status: 'VERIFIED', fileName: 'jordan-ellis-cv.pdf' },
    { id: 'd4', type: 'CERTIFICATE', status: 'VERIFIED', fileName: 'food-hygiene-l2.pdf' },
  ],
  availability: [1, 2, 3, 4, 5].map((d) => ({ id: `a${d}`, dayOfWeek: d, startTime: '06:00', endTime: '22:00' })),
  shifts: [...past, ...upcoming],
  timesheets,
};

const invitations: CandidateInvitation[] = [
  {
    id: 'inv1',
    status: 'INVITED',
    invitedAt: at(0, 8),
    responseDeadline: at(1, 18),
    respondedAt: null,
    responseNote: null,
    job: {
      title: 'Picker Packer — Nights',
      sector: 'Warehouse',
      startDate: at(6, 22),
      endDate: at(20, 6),
      location: 'Trafford Park, Manchester',
      payRate: 13.4,
      skills: ['Picking', 'RF scanner'],
      ppe: 'Hi-vis and safety boots',
      instructions: 'Report to Gate 2',
      breakInfo: '45 min',
    },
  },
];

const journey: Journey = {
  live: true,
  origin: 'M16 0RA',
  destination: 'M17 1SN',
  departAt: at(1, 6, 20),
  routes: { transit: { minutes: 34, km: 6.8 }, drive: { minutes: 17, km: 7.4 }, cycle: { minutes: 26, km: 6.1 } },
};

const notifications: Notification[] = [
  { id: 'n1', type: 'SHIFT', title: 'Shift confirmed', body: 'Warehouse Operative at Northgate Logistics, tomorrow 07:00.', createdAt: at(0, 9) },
  { id: 'n2', type: 'TIMESHEET', title: 'Timesheet approved', body: '8.0 hrs at Brightwell Foods approved.', readAt: at(0, 8), createdAt: at(-1, 17) },
  { id: 'n3', type: 'PAY', title: 'Payment sent', body: 'Your weekly pay is on its way.', readAt: at(-2, 9), createdAt: at(-2, 9) },
];

const thread = {
  id: 'th1',
  messages: [
    { id: 'm1', body: 'Hi Jordan, you are confirmed for Northgate tomorrow at 07:00. Report to Dave at Goods In.', senderIsStaff: true, senderName: 'Starff team', createdAt: at(0, 9) },
    { id: 'm2', body: 'Brilliant, thanks! Is parking on site?', senderIsStaff: false, createdAt: at(0, 9, 12) },
    { id: 'm3', body: 'Yes, free staff parking by Gate 2.', senderIsStaff: true, senderName: 'Starff team', createdAt: at(0, 9, 15) },
  ],
};

function aiReply(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('tip for this exact morning') || m.includes('alarm'))
    return 'Bus 250 runs every 12 minutes from Seymour Grove, so catching the 06:28 still gets you to Gate 2 with time to spare. Lay out your hi-vis and boots tonight so the morning is quick.';
  if (m.includes('dbs'))
    return "Your current roles (warehouse and food production) don't need a DBS check. If you apply for roles that do, you can add one under Profile → DBS.";
  if (m.includes('share code') || m.includes('right-to-work') || m.includes('right to work'))
    return "Your right to work is verified, so you don't need a share code right now. Starff will ask for a new one if your status changes.";
  if (m.includes('pay'))
    return 'You earn £12.60/hr at Northgate. This week you have 32.0 hrs logged, so about £403 plus 12.07% holiday pay (£48.66). Approved timesheets are paid the following Friday.';
  if (m.includes('timesheet'))
    return 'You have 3 approved or paid timesheets this week and 1 waiting for Northgate to approve. Approved hours are paid on Friday.';
  return "Your next shift is tomorrow at 07:00, Warehouse Operative at Northgate Logistics. Leave by 06:20 by bus and you'll arrive 15 minutes early.";
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Answers an apiFetch call in demo mode. */
export async function demoFetch(path: string, opts: { method?: string; body?: unknown } = {}): Promise<any> {
  const method = opts.method ?? 'GET';
  const p = path.split('?')[0];
  await wait(250);

  if (method === 'GET') {
    if (p === '/me' || p === '/candidates/me') return profile;
    if (p === '/me/invitations') return invitations;
    if (p === '/me/offers' || p === '/me/jobs') return [];
    if (/^\/me\/shifts\/[^/]+\/journey$/.test(p)) return journey;
    if (p === '/notifications') return notifications;
    if (p === '/messages/thread') return thread;
    if (p === '/auth/whoami') return { role: 'CANDIDATE' };
    if (p === '/me/documents/terms') return { documents: [] };
    return [];
  }
  if (p === '/ai/me/ask') {
    await wait(900);
    const msg = (opts.body as { message?: string })?.message ?? '';
    return { configured: true, reply: aiReply(msg) };
  }
  // Mutations are no-ops in demo mode.
  return {};
}
