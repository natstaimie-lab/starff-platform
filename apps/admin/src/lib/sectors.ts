/**
 * Work sectors — keep in sync with apps/api/src/common/sectors.ts (the
 * canonical list used by sign-up, filters and matching).
 *
 * ROLES are suggestions for the quote calculator's role box; staff can still
 * type any role.
 */
export const SECTORS = [
  'Warehouse & Logistics',
  'Driving & Delivery',
  'Construction & Trades',
  'Industrial & Manufacturing',
  'Security',
  'Cleaning',
  'Hospitality & Catering',
  'Events',
] as const;

export type Sector = (typeof SECTORS)[number];

export const SECTOR_ROLES: Record<Sector, string[]> = {
  'Warehouse & Logistics': ['Warehouse operative', 'Picker / packer', 'Forklift driver (counterbalance)', 'Reach truck driver', 'Goods-in operative', 'Warehouse team leader'],
  'Driving & Delivery': ['Multi-drop van driver', '7.5t driver (C1)', 'HGV Class 2 driver (C)', 'HGV Class 1 driver (C+E)', "Driver's mate"],
  'Construction & Trades': ['Labourer (CSCS)', 'Skilled labourer', 'Carpenter', 'Electrician', 'Plumber', 'Painter & decorator'],
  'Industrial & Manufacturing': ['Production operative', 'Machine operator', 'Packing operative', 'Quality inspector'],
  Security: ['SIA security officer', 'Door supervisor', 'CCTV operator', 'Event security'],
  Cleaning: ['Cleaner', 'Commercial cleaner', 'Deep cleaner', 'Cleaning supervisor'],
  'Hospitality & Catering': ['Kitchen porter', 'Catering assistant', 'Chef de partie', 'Waiting staff', 'Bartender'],
  Events: ['Event steward', 'Event crew', 'Bar staff', 'Cloakroom attendant'],
};
