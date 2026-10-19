/**
 * Canonical Starff worker documents. These are the agreements a temporary
 * worker reads, accepts and e-signs during onboarding — the worker-facing
 * equivalent of the client Terms of Business.
 *
 * Three documents:
 *   1. Terms of Engagement  — mandatory contract for services.
 *   2. Key Information Document (KID) — mandatory; worker acknowledges receipt.
 *   3. 48-hour Week Opt-Out — OPTIONAL. Signing is never a condition of work,
 *      so the worker may accept OR decline it (clause 6.3 of the Terms).
 *
 * The full text + version are snapshotted onto each CandidateAgreement at
 * sign-time, so a signed document can always be reproduced exactly as accepted.
 * Text uses the same lightweight markdown the client ToB renderer understands:
 *   `#`/`##`/`###` headings, `- ` bullets, `a | b` table rows, plain paragraphs.
 */

export const WORKER_DOC_VERSION = '2026-10-19';

export interface WorkerDoc {
  key: string;
  title: string;
  /** Optional documents can be accepted OR declined (the 48-hour opt-out). */
  optional: boolean;
  version: string;
  /** The statement the worker confirms when they e-sign. */
  confirmation: string;
  /** Lightweight-markdown body. */
  text: string;
}

const TERMS_OF_ENGAGEMENT = `# Starff Ltd — Terms of Engagement for Temporary Workers

These terms govern every temporary assignment Starff Ltd arranges for you; they form a contract for services, not a contract of employment. They are written to comply with the Conduct of Employment Agencies and Employment Businesses Regulations 2003 (the Conduct Regulations) and the Agency Workers Regulations 2010 (AWR).

## 1. Parties and status

1. Starff Ltd (company number 17166246), registered office 66 Paul Street, London EC2A 4NA (the Employment Business, "we", "us").
2. The Temporary Worker named in the Schedule ("you").
3. We act as an employment business (not an employment agency) when supplying you to Clients under these terms.
4. These terms, together with each Assignment Details Confirmation and your Key Information Document, are the whole agreement between us. They apply to every Assignment and override any other terms unless we agree a change in writing.
5. You are engaged as a worker, not an employee, of the Employment Business or the Client. Nothing in these terms creates a contract of employment. Between Assignments there is no obligation on us to offer, or on you to accept, any work.
6. We will give you a copy of these terms before you start your first Assignment, and agree any change with you in writing before it takes effect.

## 2. Definitions

- Assignment — a period during which you are supplied to work temporarily for and under the supervision and direction of a Client.
- Assignment Details Confirmation — the written confirmation we give you for each Assignment, setting out the information required by Regulation 15 of the Conduct Regulations.
- Client — the person, firm or company to whom you are supplied, together with any group company.
- Comparable Employee — has the meaning in Regulation 5 of the AWR.
- Key Information Document (KID) — the document required by Regulation 13A of the Conduct Regulations, given before you agree these terms.
- Qualifying Period — 12 continuous calendar weeks in the same role with the same Client, as defined in Regulation 7 of the AWR.
- Relevant Terms and Conditions — terms relating to pay, duration of working time, night work, rest periods, rest breaks and annual leave, as defined in the AWR.
- Timesheet — the paper or electronic record of hours worked, signed or approved by an authorised representative of the Client.
- Working Time Regulations — the Working Time Regulations 1998.

## 3. Assignments

1. We will try to find you suitable Assignments but cannot guarantee any work. You may refuse any Assignment offered.
2. Before each Assignment we will confirm in writing: the Client's identity and business; start date and expected duration; the position, duties and hours; your hourly pay rate; location; any health and safety risks and steps taken to control them; and any experience, training or qualifications required.
3. If we cannot give the full details in writing before you start (for example, a same-day booking), we will confirm them orally and then in writing within 3 business days. For Assignments of 5 consecutive business days or less with a Client you have worked for before on the same terms, only the changed details need confirming.
4. Unless confirmed otherwise, an Assignment is open-ended and may be ended by either party under clause 9.
5. If the Assignment involves working with children or vulnerable adults, or falls within a sector licensed by the Gangmasters and Labour Abuse Authority, we will carry out the checks required by law before you start.

## 4. Right to work and checks

1. Before your first Assignment you must provide original documents proving your right to work in the UK. We will repeat checks when your permission to work is time-limited.
2. You must provide, if requested, references, qualification certificates, DBS disclosures and any other documents reasonably required for the role.
3. You confirm that the information you give us is true and complete, and you will tell us promptly of any change (including convictions, cautions or loss of right to work).

## 5. Your obligations during an Assignment

While on Assignment you will:
1. co-operate with the Client's reasonable instructions and accept its direction, supervision and control;
2. follow all of the Client's rules, policies and procedures, including on health and safety, IT use, confidentiality and conduct, as notified to you;
3. not engage in any conduct that damages our or the Client's interests or reputation;
4. not work under the influence of alcohol or drugs, and comply with any lawful testing policy of the Client;
5. tell us immediately if you are aware of any reason you are unsuitable for the Assignment, or of any conflict of interest;
6. not accept direct employment or engagement with a Client you were introduced to except as allowed under clause 10;
7. tell us at once of any accident or injury at the Client's premises;
8. if you cannot attend work for any reason, tell us (and the Client) as soon as possible and no later than 1 hour before your shift starts.

## 6. Working time

1. Your hours are set by the Client and confirmed in each Assignment Details Confirmation.
2. You are entitled to the rest breaks, daily and weekly rest, and night-work protections in the Working Time Regulations.
3. You may agree in writing to opt out of the 48-hour average weekly limit. You can withdraw the opt-out on 1 month's written notice. Signing an opt-out is never a condition of work.

## 7. Pay, timesheets and deductions

1. We will pay you for each hour worked at the rate in the Assignment Details Confirmation. Your rate will never be below the National Minimum Wage or National Living Wage that applies to you.
2. We pay you directly through our PAYE payroll, deducting income tax and Class 1 National Insurance. We do not require you to work through an umbrella or personal service company.
3. You will be paid weekly in arrears by BACS on Friday, for hours worked in the previous week (Monday to Sunday), provided an approved Timesheet reaches us by 10:00 on Monday.
4. You must submit an accurate Timesheet each week, approved by the Client. Submitting a false Timesheet is gross misconduct and may be a criminal offence.
5. We will not withhold or delay your pay because the Client has not paid us, or because a Timesheet is late through no fault of yours. If a Client disputes hours, we will investigate promptly and pay you for the hours we can verify.
6. You will receive an itemised payslip each pay period, showing hours worked and any variable deductions.
7. We will only make deductions required by law (such as tax, NI and pension contributions), or ones you have agreed to in writing in advance. We will never charge you a fee for finding you work.
8. If we overpay you by mistake, we may recover the overpayment from later pay, after telling you in writing.

## 8. Holiday, sickness, AWR and pensions

### Holiday
1. You are entitled to 5.6 weeks' paid annual leave per leave year (pro rata to hours worked). Our leave year runs from 1 January to 31 December.
2. Where you work irregular hours or part of the year, holiday accrues at 12.07% of hours worked in each pay period. We may pay this as rolled-up holiday pay shown as a separate line on your payslip, as permitted for leave years starting on or after 1 April 2024.
3. Otherwise, request holiday with notice of at least twice the length of the leave requested. Untaken statutory leave is not carried over except where the law requires (for example, sickness or family leave).
4. On termination we will pay you for accrued but untaken holiday.

### Sickness
5. If you are sick, tell us and the Client before your shift starts. Statutory Sick Pay (SSP) is paid where you qualify under current legislation. There is no contractual sick pay.
6. After 7 calendar days of absence you must provide a fit note.

### Agency Workers Regulations
7. From day one you have access to the Client's collective facilities (such as canteen, childcare, transport) and to information about relevant vacancies.
8. Once you complete the Qualifying Period, you are entitled to the same basic working and employment conditions (Relevant Terms and Conditions) as if you had been recruited directly by the Client. We will update your Assignment Details Confirmation accordingly.
9. Please tell us if you believe you are not receiving equal treatment. You may request a written statement under Regulation 16 of the AWR.

### Pensions
10. If you are eligible, we will auto-enrol you into our workplace pension scheme (NEST, the National Employment Savings Trust) in line with the Pensions Act 2008. You may opt out within the opt-out period. Details are in your enrolment letter.

## 9. Ending an Assignment or these terms

1. You, we or the Client may end an Assignment at any time without notice or liability, except for pay already earned.
2. We may end an Assignment immediately if the Client asks us to, or if you commit misconduct, breach these terms, or are unable to do the work.
3. If you wish to leave an Assignment, please give us at least 1 week's notice where possible so we can tell the Client.
4. If you are absent without notifying us, we may treat the Assignment as ended after 2 working days.
5. Ending an Assignment does not end these terms. Either party may end these terms by written notice; clauses 7, 10, 11, 12 and 13 survive termination.

## 10. Moving to work directly for a Client

1. If you take up direct employment or engagement with a Client, the Client may have to pay us a transfer fee or agree an extended period of hire. You will never be charged this fee, and we will never stop you taking such a role.
2. Please tell us if a Client offers you a direct role.

## 11. Confidentiality and intellectual property

1. You must not, during or after an Assignment, disclose or misuse any confidential information about us or any Client, except as required by law or to raise a protected disclosure (whistleblowing).
2. On request, and at the end of each Assignment, you will return all Client and Starff property, documents and data.
3. Any intellectual property you create in the course of an Assignment belongs to the Client (or to us, if the Client so requires). You agree to sign any documents needed to confirm this, and waive moral rights to the extent permitted by law.

## 12. Data protection

1. We process your personal data in accordance with UK GDPR and the Data Protection Act 2018, as set out in our Privacy Notice at starff.co.uk/privacy-policy.
2. We share your data with Clients, payroll and pension providers, HMRC and others only as needed to find you work, pay you and meet legal obligations.
3. You must handle any personal data you access during an Assignment in line with the Client's data protection policies.

## 13. Liability, complaints and general

1. You are not liable to us for loss caused by your ordinary negligence while working under the Client's supervision, but you may be liable for loss caused by fraud, dishonesty or deliberate wrongdoing.
2. We hold employer's liability insurance as required by law. The Client is responsible for health and safety at its premises.
3. If you have a complaint about an Assignment, a Client or us, contact Starff Ltd at hello@starff.co.uk. We will acknowledge it within 5 working days. You can also contact the Employment Agency Standards Inspectorate or ACAS.
4. Nothing in these terms limits your statutory rights, including protection from discrimination, harassment and detriment for whistleblowing.
5. If any clause is found unenforceable, the rest remain in force. No delay in enforcing a right waives it.
6. These terms are governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.

## 14. Key Information Document

You confirm you received your Key Information Document before agreeing to these terms. It sets out, on one page, who pays you, your minimum expected pay rate, how you are paid, any deductions or fees, and your holiday entitlement. We will issue an updated KID if any of that information changes.

## Schedule — Worker and Assignment details

Item | Details
Worker full name | (your account name)
Start date of these terms | (date you accept below)
Type of work | Confirmed in each Assignment Details Confirmation
Minimum hourly rate (before deductions) | Confirmed per assignment; never below NMW/NLW
Holiday pay method | Rolled-up at 12.07% / accrued
Pay frequency and method | Weekly in arrears, BACS
Notice to leave an Assignment | 1 week where possible
48-hour opt-out signed | Recorded separately (optional)
Complaints contact | hello@starff.co.uk`;

const KEY_INFORMATION_DOCUMENT = `# Starff Ltd — Key Information Document

This document gives you key information about who will pay you, how much and what deductions will be made. It does not form part of your contract. Read it alongside your Terms of Engagement, and contact hello@starff.co.uk if anything is unclear. Starff Ltd must give you this document before you agree terms, and an updated one if any of this information changes.

## Section 1: General information

Your name | (your account name)
Name of your employment business | Starff Ltd (company number 17166246), 66 Paul Street, London EC2A 4NA
Type of contract | Contract for services as a temporary agency worker (you are a worker, not an employee)
Who will pay you | Starff Ltd, directly through its PAYE payroll. No umbrella or intermediary company is used.
Expected start date | Confirmed for each assignment
Expected length of assignment | Confirmed for each assignment (e.g. 4 weeks / ongoing)
Notice period | None required by either party to end an assignment. We ask for 1 week's notice where possible if you wish to leave.
Pay intervals | Weekly, by BACS every Friday, for the previous Monday–Sunday. Approved timesheets are due by 10:00 on Monday.

## Section 2: Pay

Minimum expected rate of pay | Confirmed per assignment, per hour (never below the National Minimum Wage / National Living Wage for your age)
Deductions required by law | Income tax (PAYE), employee National Insurance, workplace pension contributions (NEST) unless you opt out
Any other deductions or costs | None
Any fees for goods or services | None. Starff Ltd never charges you for finding you work.
Holiday entitlement and pay | 5.6 weeks per year, pro rata. Holiday year runs 1 January – 31 December. For irregular-hours or part-year work, holiday pay is 12.07% of pay for hours worked, paid each week as a separate payslip line (rolled-up holiday pay).
Additional benefits | Equal pay and basic conditions after 12 weeks in the same role with the same client (Agency Workers Regulations); access to client facilities from day one; Statutory Sick Pay where you qualify

### Representative example of pay

This example is for illustration only. It assumes 40 hours in one week at £12.71 per hour (the National Living Wage from 1 April 2026), tax code 1257L, and 2026/27 tax and NI thresholds. Your actual pay will depend on your rate, hours and tax code.

Item | Amount
Pay for hours worked (40 × £12.71) | £508.40
Rolled-up holiday pay (12.07%) | £61.36
Gross pay | £569.76
Income tax | −£65.60
Employee National Insurance (8%) | −£26.22
Pension contribution (4% of qualifying earnings; 1% tax relief added by NEST) | −£17.99
Estimated take-home pay | £459.95`;

const OPT_OUT_48_HOUR = `# Starff Ltd — 48-Hour Week Opt-Out Agreement

By signing this form you agree that the 48-hour limit on your average weekly working time will not apply to you, under Regulation 5 of the Working Time Regulations 1998. Signing is voluntary: you will not be refused work or treated less favourably if you choose not to sign or later withdraw.

## Agreement

Between Starff Ltd (company number 17166246), 66 Paul Street, London EC2A 4NA, and the worker named below.

1. I agree that the limit of an average of 48 hours' work per week, calculated over a 17-week reference period, will not apply to me during any assignment arranged by Starff Ltd.
2. I understand this opt-out does not affect my other rights under the Working Time Regulations, including daily and weekly rest periods, rest breaks, paid annual leave and night-work limits.
3. I can withdraw this agreement at any time by giving Starff Ltd 1 month's written notice, by emailing hello@starff.co.uk.
4. Starff Ltd will keep a record of the hours I work while this agreement is in force.
5. If I am under 18, this opt-out does not apply: young workers may not work more than 8 hours a day or 40 hours a week.

## Withdrawing later

You can withdraw your opt-out at any time by giving Starff Ltd 1 month's written notice — email hello@starff.co.uk. Withdrawal takes effect 1 month from the date Starff Ltd receives your notice. You can decline this opt-out now and sign it later, or never — it is entirely your choice.`;

export const WORKER_DOCUMENTS: WorkerDoc[] = [
  {
    key: 'terms-of-engagement',
    title: 'Terms of Engagement for Temporary Workers',
    optional: false,
    version: WORKER_DOC_VERSION,
    confirmation:
      'I confirm I have read, understood and agree to these Terms of Engagement, and have received the Key Information Document.',
    text: TERMS_OF_ENGAGEMENT,
  },
  {
    key: 'key-information-document',
    title: 'Key Information Document',
    optional: false,
    version: WORKER_DOC_VERSION,
    confirmation:
      'I confirm I have received and read this Key Information Document before agreeing my Terms of Engagement.',
    text: KEY_INFORMATION_DOCUMENT,
  },
  {
    key: 'opt-out-48-hour',
    title: '48-Hour Week Opt-Out Agreement',
    optional: true,
    version: WORKER_DOC_VERSION,
    confirmation:
      'I agree to opt out of the 48-hour average weekly working-time limit. I understand signing is voluntary and that I can withdraw on one month’s written notice.',
    text: OPT_OUT_48_HOUR,
  },
];

export function getWorkerDoc(key: string): WorkerDoc | undefined {
  return WORKER_DOCUMENTS.find((d) => d.key === key);
}

/** Full-text snapshot stored at sign-time (reproduces exactly what was agreed). */
export function workerAgreementSnapshot(doc: WorkerDoc): string {
  return `${doc.text}\n\n${doc.confirmation}`;
}
