/**
 * Shapes returned by the shared Starff API. These mirror the Prisma models in
 * database/prisma/schema.prisma. Kept intentionally permissive (optional
 * fields) so a backend addition never crashes an older app build.
 */

export type Role = 'ADMIN' | 'RECRUITER' | 'CANDIDATE' | 'CLIENT';

export type CandidateStatus =
  | 'NEW'
  | 'SCREENING'
  | 'COMPLIANT'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'REJECTED';

export type DocumentType =
  | 'RIGHT_TO_WORK'
  | 'DBS_CHECK'
  | 'ID'
  | 'CV'
  | 'CERTIFICATE'
  | 'REFERENCE'
  | 'CONTRACT'
  | 'QUALIFICATION'
  | 'LICENCE'
  | 'OTHER';

export type DocumentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';

export type ShiftStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type TimesheetStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'INVOICED'
  | 'PAID';

export interface CandidateDocument {
  id: string;
  type: DocumentType;
  fileName?: string | null;
  status: DocumentStatus;
  expiryDate?: string | null;
  createdAt?: string;
}

export interface Availability {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface Addr {
  name?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  postcode?: string | null;
}

export interface Job {
  id: string;
  title: string;
  payRate?: string | number;
  chargeRate?: string | number;
  ppe?: string | null;
  uniform?: string | null;
  breakInfo?: string | null;
  reportingContact?: string | null;
  reportingInstructions?: string | null;
  siteInstructions?: string | null;
  client?: ({ id?: string; name: string } & Addr) | null;
  site?: { id: string; name: string; city?: string | null } | null;
}

export interface Shift {
  id: string;
  status: ShiftStatus;
  startAt: string;
  endAt: string;
  breakMinutes?: number;
  payRate?: string | number;
  notes?: string | null;
  job?: Job | null;
  site?: ({ id?: string; name?: string | null } & Addr) | null;
}

export interface Timesheet {
  id: string;
  status: TimesheetStatus;
  hoursWorked?: string | number | null;
  clockIn?: string | null;
  clockOut?: string | null;
  shift?: Shift | null;
}

export interface CandidateProfile {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  city?: string | null;
  postcode?: string | null;
  status: CandidateStatus;
  available?: boolean;
  headline?: string | null;
  rightToWorkType?: string | null;
  documents?: CandidateDocument[];
  availability?: Availability[];
  shifts?: Shift[];
  timesheets?: Timesheet[];
}

export interface ClientOverview {
  client?: { id: string; name: string; status?: string };
  counts?: {
    activeBookings?: number;
    pendingTimesheets?: number;
    workers?: number;
    openJobs?: number;
  };
  spend?: number | string;
  activeBookings?: Shift[];
  pendingTimesheets?: Timesheet[];
  [key: string]: unknown;
}

export interface OpenJob {
  id: string;
  title: string;
  payRate?: string | number;
  openings: number;
  client: string;
  city?: string | null;
  applied: boolean;
}

export interface AiReply {
  configured: boolean;
  reply: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface CandidateInvitation {
  id: string;
  status: string;
  invitedAt: string | null;
  responseDeadline: string | null;
  respondedAt: string | null;
  responseNote: string | null;
  job: {
    title: string;
    sector: string | null;
    startDate: string | null;
    endDate: string | null;
    location: string | null;
    payRate: string | number;
    skills: string[];
    ppe: string | null;
    instructions: string | null;
    breakInfo: string | null;
  };
}

export interface ClientSubmission {
  id: string;
  status: string;
  submittedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  adminSummary: string | null;
  job: { id: string; title: string; startDate: string | null; endDate: string | null; openings: number };
  candidate: {
    firstName: string;
    reference: string;
    role: string;
    experience: string | null;
    skills: string[];
    qualifications: string[];
    availability: string[];
    travelArea: string | null;
    complianceConfirmed: boolean;
    rating: number | null;
  };
}
