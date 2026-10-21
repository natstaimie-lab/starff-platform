/**
 * Seed the Skill catalogue with a realistic UK temporary-staffing list,
 * grouped by sector/category. Idempotent: upserts by unique name, so it is safe
 * to run again (adds new ones, leaves existing untouched). Additive only — never
 * deletes. Skill names deliberately include licence/badge cues (SIA, CSCS, DBS,
 * Forklift…) so the matcher's document inference picks up required compliance.
 *
 * Run:  node --env-file=.env scripts/seed-skills.mjs
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CATALOGUE = {
  'Warehouse & Logistics': [
    'Warehouse Operative', 'Pick & Pack', 'Order Picking', 'Goods In / Goods Out',
    'Stock Control', 'Loading & Unloading', 'RF Scanner', 'Voice Picking',
    'Powered Pallet Truck (LLOP/PPT)', 'Forklift – Counterbalance', 'Forklift – Reach',
    'Forklift – VNA', 'Forklift – Bendi / Flexi',
  ],
  'Driving': [
    'Multidrop Delivery Driver', 'Van Driver (3.5t)', '7.5t Driver',
    'HGV Class 2 (Cat C)', 'HGV Class 1 (Cat C+E)', 'Trunking', 'Tramping',
    'Moffett Mounted Forklift',
  ],
  'Construction & Trades': [
    'General Labourer (CSCS)', 'Skilled Labourer', 'Groundworker',
    'Traffic Marshal / Banksman', 'Scaffolder', 'Carpenter', 'Bricklayer',
    'Painter & Decorator', 'Dumper Driver (CPCS)', 'Telehandler (CPCS)',
  ],
  'Industrial & Manufacturing': [
    'Production Operative', 'Assembly Operative', 'Machine Operator',
    'Quality Control / Inspection', 'Food Production Operative', 'FMCG Operative',
    'Line Leader',
  ],
  'Security (SIA)': [
    'Door Supervisor (SIA)', 'Security Guard (SIA)', 'CCTV Operator (SIA)',
    'Retail Security / Loss Prevention (SIA)', 'Event Security (SIA)', 'Keyholding',
  ],
  'Cleaning': [
    'Commercial Cleaner', 'Industrial Cleaner', 'Housekeeper',
    'Kitchen Porter / Cleaner', 'Deep Cleaning', 'Window Cleaner',
  ],
  'Hospitality & Catering': [
    'Waiting Staff', 'Bar Staff', 'Barista', 'Kitchen Porter',
    'Chef – Commis', 'Chef – Chef de Partie', 'Chef – Sous', 'Chef – Head',
    'Food & Beverage Assistant', 'Banqueting Staff',
  ],
  'Care & Healthcare': [
    'Care Assistant (DBS)', 'Senior Carer (DBS)', 'Support Worker (DBS)',
    'Healthcare Assistant / HCA (DBS)', 'Domiciliary Care Worker (DBS)',
  ],
  'Events': [
    'Event Steward', 'Event Crew', 'Setup / Breakdown Crew',
    'Brand Ambassador', 'Promotional Staff',
  ],
  'Office & Admin': [
    'Administrator', 'Data Entry', 'Receptionist',
    'Customer Service Advisor', 'Call Centre Agent', 'Mailroom Operative',
  ],
};

async function main() {
  let added = 0, kept = 0;
  for (const [category, names] of Object.entries(CATALOGUE)) {
    for (const name of names) {
      const existing = await prisma.skill.findUnique({ where: { name } });
      if (existing) {
        // Backfill the category if it was missing, otherwise leave it.
        if (!existing.category) {
          await prisma.skill.update({ where: { name }, data: { category } });
        }
        kept++;
      } else {
        await prisma.skill.create({ data: { name, category } });
        added++;
      }
    }
  }
  const total = await prisma.skill.count();
  console.log(`Skills seeded. Added ${added}, already present ${kept}. Catalogue now holds ${total} skills across ${Object.keys(CATALOGUE).length} sectors.`);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
