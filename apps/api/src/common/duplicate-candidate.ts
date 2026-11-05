import { PrismaService } from '../prisma/prisma.service';

/**
 * Finds an existing (non-archived) candidate who is probably the same person.
 *
 * Two signals, strongest first:
 *  1. Same phone number, compared on its last 10 digits so "07742 545 967",
 *     "+44 7742 545967" and "447742545967" all match.
 *  2. Same first name + last name (case-insensitive) AND same date of birth.
 *     Name alone is never enough — two real people can share a name.
 *
 * Used to block self-sign-ups and to warn admins. Never auto-merges anything.
 */
export interface DuplicateMatch {
  candidateId: string;
  name: string;
  reason: 'phone' | 'name_dob';
}

export function phoneKey(phone?: string | null): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export async function findPossibleDuplicate(
  prisma: PrismaService,
  input: {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    dateOfBirth?: Date | null;
    /** Skip this user's own profile (e.g. a resumed registration). */
    excludeUserId?: string;
  },
): Promise<DuplicateMatch | null> {
  const key = phoneKey(input.phone);
  if (key) {
    const rows = await prisma.$queryRaw<{ id: string; firstName: string; lastName: string; userId: string }[]>`
      SELECT id, "firstName", "lastName", "userId"
      FROM "Candidate"
      WHERE "archivedAt" IS NULL
        AND phone IS NOT NULL
        AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = ${key}
      LIMIT 5`;
    const hit = rows.find((r) => r.userId !== input.excludeUserId);
    if (hit) return { candidateId: hit.id, name: `${hit.firstName} ${hit.lastName}`, reason: 'phone' };
  }

  const first = input.firstName?.trim();
  const last = input.lastName?.trim();
  if (first && last && input.dateOfBirth) {
    const hit = await prisma.candidate.findFirst({
      where: {
        archivedAt: null,
        firstName: { equals: first, mode: 'insensitive' },
        lastName: { equals: last, mode: 'insensitive' },
        dateOfBirth: input.dateOfBirth,
        ...(input.excludeUserId ? { userId: { not: input.excludeUserId } } : {}),
      },
      select: { id: true, firstName: true, lastName: true },
    });
    if (hit) return { candidateId: hit.id, name: `${hit.firstName} ${hit.lastName}`, reason: 'name_dob' };
  }
  return null;
}

/** What a self-signing-up person sees — deliberately doesn't reveal whose account it is. */
export const DUPLICATE_SIGNUP_MESSAGE =
  'It looks like you already have a Starff account. Please log in instead, or email hello@starff.co.uk and we will sort it out.';
