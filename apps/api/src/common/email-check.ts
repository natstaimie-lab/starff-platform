import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/**
 * Catches the email typos that stop people ever receiving their activation
 * email — "name@gmail.con", "name@gmial.com", "name@hotmail.co.uk.com".
 *
 * Deliberately a short, conservative list: it only flags endings and big-provider
 * misspellings that are almost never real, so it won't reject genuine company
 * addresses. Returns a suggested correction so the form can say "Did you mean…?".
 *
 * KEEP IN SYNC with the copies in:
 *   apps/candidate/src/lib/email-check.ts
 *   apps/mobile/src/lib/email-check.ts
 */

// Mistyped endings → correct ending.
const BAD_ENDINGS: Record<string, string> = {
  '.con': '.com', '.cmo': '.com', '.ocm': '.com', '.vom': '.com', '.xom': '.com',
  '.comm': '.com', '.coom': '.com', '.comn': '.com', '.cpm': '.com', '.c0m': '.com',
  '.co.ukk': '.co.uk', '.co.uj': '.co.uk', '.co.ik': '.co.uk', '.couk': '.co.uk',
  '.co.uk.com': '.co.uk', '.com.uk': '.co.uk',
  '.nett': '.net', '.ner': '.net',
};

// Misspelled big-provider names (the part before the first dot) → correct name.
const PROVIDER_TYPOS: Record<string, string> = {
  gmial: 'gmail', gamil: 'gmail', gmal: 'gmail', gmai: 'gmail', gnail: 'gmail',
  gmaill: 'gmail', gmali: 'gmail', gmil: 'gmail', gmaik: 'gmail', gimail: 'gmail',
  hotmial: 'hotmail', hotmal: 'hotmail', hotmai: 'hotmail', hotmil: 'hotmail',
  hotamil: 'hotmail', hotmali: 'hotmail', homail: 'hotmail', hotmaill: 'hotmail',
  outlok: 'outlook', outllok: 'outlook', oulook: 'outlook', outlool: 'outlook', otlook: 'outlook',
  yaho: 'yahoo', yahooo: 'yahoo', yhoo: 'yahoo', yahho: 'yahoo',
  iclod: 'icloud', icoud: 'icloud', iclould: 'icloud', icould: 'icloud', icloude: 'icloud', icluod: 'icloud',
};

// Providers that only exist on one ending — "gmail.co" / "icloud.co.uk" are typos.
const PROVIDER_HOME: Record<string, string[]> = {
  gmail: ['gmail.com'],
  icloud: ['icloud.com'],
  outlook: ['outlook.com', 'outlook.co.uk'],
  hotmail: ['hotmail.com', 'hotmail.co.uk'],
  yahoo: ['yahoo.com', 'yahoo.co.uk'],
};

export interface EmailCheck {
  ok: boolean;
  /** The likely intended address, when we can tell. */
  suggestion?: string;
}

export function checkEmail(raw: string | null | undefined): EmailCheck {
  const email = (raw ?? '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return { ok: false };
  const local = email.slice(0, at);
  let domain = email.slice(at + 1);
  let changed = false;

  for (const [bad, good] of Object.entries(BAD_ENDINGS)) {
    if (domain.endsWith(bad)) {
      domain = domain.slice(0, -bad.length) + good;
      changed = true;
      break;
    }
  }

  const [name, ...rest] = domain.split('.');
  const fixedName = PROVIDER_TYPOS[name];
  if (fixedName) {
    domain = [fixedName, ...rest].join('.');
    changed = true;
  }

  const provider = domain.split('.')[0];
  const homes = PROVIDER_HOME[provider];
  if (homes && !homes.includes(domain)) {
    domain = homes[0];
    changed = true;
  }

  return changed ? { ok: false, suggestion: `${local}@${domain}` } : { ok: true };
}

export function emailTypoMessage(raw: string): string {
  const { suggestion } = checkEmail(raw);
  return suggestion
    ? `That email address looks mistyped. Did you mean ${suggestion}?`
    : 'That email address looks mistyped. Please check it.';
}

/** class-validator decorator: use alongside @IsEmail() on person emails. */
export function IsLikelyRealEmail(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isLikelyRealEmail',
      target: object.constructor,
      propertyName,
      options: {
        message: (args: ValidationArguments) => emailTypoMessage(String(args.value ?? '')),
        ...options,
      },
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null || value === '') return true; // @IsOptional / @IsEmail handle presence
          return typeof value === 'string' && checkEmail(value).ok;
        },
      },
    });
  };
}
