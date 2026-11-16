import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';

/**
 * Branded client-facing quote PDF.
 *
 * Shows ONLY what the client should see: role, booking, hours, charge rate and
 * totals. Pay rates, margins, costs, profit and internal notes never appear.
 */

export interface QuotePdfInput {
  number: string;
  title: string | null;
  companyName: string;
  contactName: string | null;
  createdAt: Date;
  validUntil: Date;
  total: number;
  lines: {
    description: string;
    temps: number;
    shifts: number;
    hoursPerShift: number;
    shiftType: string;
    chargeRate: number;
    totalHours: number;
    total: number;
  }[];
}

const ORANGE = '#F47A20', INK = '#0B1F3A', MUTED = '#5A6B82', LINE = '#CBD6E4', TINT = '#FFF3EA', ZEBRA = '#F5F7FA';

const SHIFT_LABEL: Record<string, string> = {
  standard: 'Day', night: 'Night', weekend: 'Weekend', bank_holiday: 'Bank holiday',
};

const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));

/** The logo ships in apps/api/assets; the API may run from the repo root (Railway) or apps/api (dev). */
function logo(): Buffer | null {
  for (const p of [
    join(process.cwd(), 'apps/api/assets/starff-horizontal.png'),
    join(process.cwd(), 'assets/starff-horizontal.png'),
    join(__dirname, '../../assets/starff-horizontal.png'),
  ]) {
    if (existsSync(p)) return readFileSync(p);
  }
  return null;
}

export function quoteFilename(number: string): string {
  return `Starff-quote-${number}.pdf`;
}

export async function buildQuotePdf(q: QuotePdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Title: `Starff quote ${q.number}`, Author: 'Starff Ltd' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const W = R - L;

  // ── Header: logo left, QUOTE + number right, orange rule ──
  const img = logo();
  if (img) doc.image(img, L, 46, { height: 40 });
  else doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(24).text('STARFF', L, 52);

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(22).text('QUOTE', L, 48, { width: W, align: 'right' });
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(q.number, L, 74, { width: W, align: 'right' });
  doc.rect(L, 100, W, 3).fill(ORANGE);

  // ── Prepared for / dates ──
  let y = 122;
  const colW = W / 2 - 10;
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8.5).text('PREPARED FOR', L, y, { characterSpacing: 0.6 });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12).text(q.companyName, L, y + 14, { width: colW });
  if (q.contactName) doc.fillColor(INK).font('Helvetica').fontSize(10).text(q.contactName, { width: colW });
  const leftBottom = doc.y;

  const meta: [string, string][] = [
    ['Quote number', q.number],
    ['Date', longDate(q.createdAt)],
    ['Valid until', longDate(q.validUntil)],
  ];
  let my = y;
  for (const [k, v] of meta) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(k, L + W / 2, my, { width: 90 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9.5).text(v, L + W / 2 + 90, my, { width: W / 2 - 90, align: 'right' });
    my += 16;
  }
  y = Math.max(leftBottom, my) + 18;

  if (q.title) {
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(14).text(q.title, L, y, { width: W });
    y = doc.y + 10;
  }

  // ── Lines table ──
  const cols = [
    { h: 'Role', w: 0.30, align: 'left' as const },
    { h: 'Booking', w: 0.27, align: 'left' as const },
    { h: 'Hours', w: 0.11, align: 'right' as const },
    { h: 'Rate / hour', w: 0.15, align: 'right' as const },
    { h: 'Total', w: 0.17, align: 'right' as const },
  ];
  const xs: number[] = [];
  let cx = L;
  for (const c of cols) { xs.push(cx); cx += c.w * W; }
  const pad = 8;

  const header = () => {
    doc.rect(L, y, W, 24).fill(INK);
    cols.forEach((c, i) => {
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9)
        .text(c.h, xs[i] + pad, y + 8, { width: c.w * W - pad * 2, align: c.align });
    });
    y += 24;
  };
  header();

  q.lines.forEach((l, idx) => {
    const booking = `${l.temps} ${l.temps === 1 ? 'person' : 'people'} × ${l.shifts} ${l.shifts === 1 ? 'shift' : 'shifts'} × ${num(l.hoursPerShift)}h\n${SHIFT_LABEL[l.shiftType] ?? l.shiftType} shifts`;
    const cells = [l.description, booking, num(l.totalHours), gbp(l.chargeRate), gbp(l.total)];
    doc.font('Helvetica').fontSize(9.5);
    const h = Math.max(...cells.map((t, i) => doc.heightOfString(t, { width: cols[i].w * W - pad * 2 }))) + 16;
    if (y + h > doc.page.height - 190) { doc.addPage(); y = doc.page.margins.top; header(); }
    if (idx % 2 === 1) doc.rect(L, y, W, h).fill(ZEBRA);
    cells.forEach((t, i) => {
      doc.fillColor(i === 1 ? MUTED : INK).font(i === 0 || i === 4 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5)
        .text(t, xs[i] + pad, y + 8, { width: cols[i].w * W - pad * 2, align: cols[i].align });
    });
    y += h;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor(LINE).stroke();
  });

  // ── Total box ──
  y += 14;
  if (y > doc.page.height - 200) { doc.addPage(); y = doc.page.margins.top; }
  const boxW = 230;
  doc.roundedRect(R - boxW, y, boxW, 46, 6).fill(TINT);
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8.5).text('QUOTE TOTAL', R - boxW + 14, y + 9, { characterSpacing: 0.6 });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(gbp(q.total), R - boxW + 14, y + 20, { width: boxW - 28, align: 'right' });
  doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text('No VAT is charged — Starff Ltd is not VAT-registered.', L, y + 16, { width: W - boxW - 20 });
  y += 70;

  // ── Terms ──
  const terms = [
    'Rates are per hour worked and include the worker\'s pay, holiday pay, employer National Insurance, pension contributions and Starff\'s fee.',
    'Hours are charged as shown on approved timesheets. The minimum charge is 4 hours per shift.',
    'Night, weekend and bank holiday rates apply to those shifts as quoted above.',
    `This quote is valid until ${longDate(q.validUntil)}. Rates may change after that date or if legal minimum pay rates change.`,
    'All work is supplied under Starff\'s Client Terms of Business.',
  ];
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10.5).text('What\'s included', L, y);
  doc.moveDown(0.4);
  for (const t of terms) doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('•  ' + t, { width: W, lineGap: 2, indent: 0 });

  doc.moveDown(1.2);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10.5).text('Ready to go ahead?');
  doc.fillColor(MUTED).font('Helvetica').fontSize(9.5)
    .text('Reply to the email this quote came with, or contact hello@starff.co.uk, and we\'ll get your team booked in.', { width: W, lineGap: 2 });

  // ── Footer on every page ──
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // let the footer sit below the normal margin without adding a page
    const fy = doc.page.height - 58;
    doc.moveTo(L, fy).lineTo(R, fy).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(
      'Starff Ltd · registered in England & Wales, company no. 17166246 · 66 Paul Street, London EC2A 4NA · starff.co.uk',
      L, fy + 8, { width: W, align: 'center', lineBreak: false },
    );
  }

  doc.end();
  return done;
}
