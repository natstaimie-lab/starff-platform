/**
 * Typed wrappers over the existing Starff API endpoints.
 *
 * Every function here maps 1:1 to a route that ALREADY EXISTS in apps/api
 * (verified against the controllers). Nothing new is invented on the client.
 * See docs/MOBILE.md for the full screen → endpoint integration map.
 */
import { apiFetch, idempotencyKey } from '@/lib/api';
import type {
  AiReply,
  CandidateInvitation,
  CandidateProfile,
  ClientOverview,
  ClientSubmission,
  Notification,
  OpenJob,
  Shift,
  Timesheet,
} from '@/lib/types';

// ── Candidate (role CANDIDATE) ────────────────────────────────────────────
export const candidateApi = {
  /** GET /me — profile + documents + availability + shifts + timesheets. */
  me: () => apiFetch<CandidateProfile>('/me'),

  /** POST /candidates — idempotent self-provision of the profile on first login. */
  ensureProfile: (input: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    registrationSource?: 'MOBILE';
  }) =>
    apiFetch<CandidateProfile>('/candidates', {
      method: 'POST',
      body: { registrationSource: 'MOBILE', ...input },
    }),

  /** PATCH /candidates/:id — update own profile / onboarding fields. */
  updateProfile: (id: string, patch: Record<string, unknown>) =>
    apiFetch<CandidateProfile>(`/candidates/${id}`, {
      method: 'PATCH',
      body: patch,
    }),

  /** GET /me/offers — OPEN unassigned shifts the candidate can accept. */
  offers: () => apiFetch<Shift[]>('/me/offers'),

  /** POST /me/offers/:shiftId/accept — idempotent shift acceptance. */
  acceptOffer: (shiftId: string) =>
    apiFetch<Shift>(`/me/offers/${shiftId}/accept`, {
      method: 'POST',
      idempotencyKey: idempotencyKey('accept-offer', shiftId),
    }),

  /** PUT /me/availability — the days (0=Sun…6=Sat) the candidate is available. */
  setAvailability: (days: number[]) =>
    apiFetch('/me/availability', { method: 'PUT', body: { days } }),

  /** Shift check-in actions. */
  acknowledgeShift: (id: string) => apiFetch(`/me/shifts/${id}/acknowledge`, { method: 'POST', idempotencyKey: idempotencyKey('ack', id) }),
  checkInShift: (id: string) => apiFetch(`/me/shifts/${id}/check-in`, { method: 'POST', idempotencyKey: idempotencyKey('checkin', id) }),
  checkOutShift: (id: string) => apiFetch(`/me/shifts/${id}/check-out`, { method: 'POST', idempotencyKey: idempotencyKey('checkout', id) }),
  reportLate: (id: string) => apiFetch(`/me/shifts/${id}/report-late`, { method: 'POST' }),

  /** GET /me/invitations — job invitations Starff has sent this candidate (safe view). */
  invitations: () => apiFetch<CandidateInvitation[]>('/me/invitations'),

  /** POST /me/invitations/:id/respond — confirm interest / availability. */
  respondInvitation: (
    id: string,
    response: 'INTERESTED' | 'UNAVAILABLE' | 'DECLINE' | 'INFO',
    note?: string,
  ) =>
    apiFetch(`/me/invitations/${id}/respond`, {
      method: 'POST',
      body: { response, note },
      idempotencyKey: idempotencyKey('respond-invitation', id, response),
    }),

  /** GET /me/jobs — OPEN jobs the candidate can apply to. */
  jobs: () => apiFetch<OpenJob[]>('/me/jobs'),

  /** POST /me/jobs/:id/apply — apply (idempotent). */
  applyToJob: (jobId: string) =>
    apiFetch(`/me/jobs/${jobId}/apply`, {
      method: 'POST',
      idempotencyKey: idempotencyKey('apply', jobId),
    }),

  /** POST /ai/me/ask — worker AI assistant grounded on the worker's own record. */
  aiAsk: (message: string, history: { role: 'user' | 'assistant'; content: string }[] = []) =>
    apiFetch<AiReply>('/ai/me/ask', { method: 'POST', body: { message, history } }),

  /** POST /me/timesheets/:shiftId — submit hours for a completed shift. */
  submitTimesheet: (
    shiftId: string,
    input: { clockIn?: string; clockOut?: string; breakMinutes?: number; hoursWorked?: number },
  ) =>
    apiFetch<Timesheet>(`/me/timesheets/${shiftId}`, {
      method: 'POST',
      body: input,
      idempotencyKey: idempotencyKey('submit-timesheet', shiftId),
    }),

  /** POST /me/documents — register an uploaded document (see uploads flow). */
  addDocument: (input: { type: string; fileUrl: string; fileName?: string; expiryDate?: string }) =>
    apiFetch('/me/documents', { method: 'POST', body: input }),

  /** PUT /me/declarations — GDPR consent, agreement, e-signature. */
  setDeclarations: (input: Record<string, unknown>) =>
    apiFetch('/me/declarations', { method: 'PUT', body: input }),
};

// ── Client / employer (role CLIENT) ───────────────────────────────────────
export const clientApi = {
  /** GET /client/me — the client-contact's company. */
  me: () => apiFetch('/client/me'),

  /** GET /client/overview — dashboard KPIs + active bookings + timesheets. */
  overview: () => apiFetch<ClientOverview>('/client/overview'),

  /** GET /client/jobs — the company's bookings. */
  jobs: () => apiFetch('/client/jobs'),

  /** POST /client/jobs — Book Staff (create a job request). */
  createJob: (input: Record<string, unknown>) =>
    apiFetch('/client/jobs', {
      method: 'POST',
      body: input,
      idempotencyKey: idempotencyKey('create-job', input.title as string, Date.now()),
    }),

  /** GET /client/submissions — candidates Starff has put forward (redacted). */
  submissions: () => apiFetch<ClientSubmission[]>('/client/submissions'),

  /** POST /client/submissions/:id/decision — accept / reject / request alternative. */
  decideSubmission: (id: string, decision: 'ACCEPT' | 'REJECT' | 'ALTERNATIVE', note?: string) =>
    apiFetch(`/client/submissions/${id}/decision`, {
      method: 'POST',
      body: { decision, note },
      idempotencyKey: idempotencyKey('decide-submission', id, decision),
    }),

  /** POST /client/submissions/:id/request-replacement — flag a booked worker for replacement. */
  requestReplacement: (id: string, reason?: string) =>
    apiFetch(`/client/submissions/${id}/request-replacement`, {
      method: 'POST',
      body: { reason },
    }),

  /** GET /client/workers — workers assigned to the company's shifts. */
  workers: () => apiFetch('/client/workers'),

  /** GET /client/timesheets — timesheets awaiting the company's approval. */
  timesheets: () => apiFetch<Timesheet[]>('/client/timesheets'),

  /** PATCH /client/timesheets/:id/approve — approve a timesheet. */
  approveTimesheet: (id: string) =>
    apiFetch(`/client/timesheets/${id}/approve`, {
      method: 'PATCH',
      idempotencyKey: idempotencyKey('approve-timesheet', id),
    }),

  /** GET /client/invoices — the company's invoices. */
  invoices: () => apiFetch('/client/invoices'),

  /** GET /client/invoices/:id — one invoice with its line items. */
  invoice: (id: string) => apiFetch(`/client/invoices/${id}`),

  /** GET /client/locations — hiring sites. */
  locations: () => apiFetch('/client/locations'),

  /** PATCH /client/profile — edit the company profile. */
  updateProfile: (patch: Record<string, unknown>) =>
    apiFetch('/client/profile', { method: 'PATCH', body: patch }),

  /** POST /client/locations — add a hiring site. */
  addLocation: (input: Record<string, unknown>) =>
    apiFetch('/client/locations', { method: 'POST', body: input }),

  /** DELETE /client/locations/:id — remove a hiring site. */
  removeLocation: (id: string) =>
    apiFetch(`/client/locations/${id}`, { method: 'DELETE' }),

  /** GET /client/contacts — authorised users on the account. */
  contacts: () => apiFetch('/client/contacts'),

  /** POST /client/contacts — add an authorised user. */
  addContact: (input: Record<string, unknown>) =>
    apiFetch('/client/contacts', { method: 'POST', body: input }),

  /** DELETE /client/contacts/:id — remove an authorised user. */
  removeContact: (id: string) =>
    apiFetch(`/client/contacts/${id}`, { method: 'DELETE' }),

  /** PUT /client/agreement — accept terms + typed e-signature. */
  setAgreement: (input: { agreementAccepted: boolean; signatureName: string }) =>
    apiFetch('/client/agreement', { method: 'PUT', body: input }),

  /** POST /client/register-company — self-provision a company on employer signup (idempotent). */
  registerCompany: (input: { companyName: string; firstName?: string; lastName?: string; phone?: string; postcode?: string }) =>
    apiFetch('/client/register-company', { method: 'POST', body: input }),
};

// ── Shared: messaging (roles CANDIDATE + CLIENT) ───────────────────────────
export const messagesApi = {
  /** GET /messages/thread — the member's single conversation with Starff. */
  thread: () => apiFetch('/messages/thread'),
  /** POST /messages/thread — send a message to the Starff team. */
  send: (body: string) =>
    apiFetch('/messages/thread', { method: 'POST', body: { body } }),
};

// ── Shared: notifications + push (any authenticated user) ───────────────────
export const notificationsApi = {
  /** GET /notifications — the current user's notifications, newest first. */
  list: () => apiFetch<Notification[]>('/notifications'),
  /** PATCH /notifications/:id/read — mark one as read. */
  markRead: (id: string) => apiFetch(`/notifications/${id}/read`, { method: 'PATCH' }),
  /** POST /notifications/read-all — mark everything read. */
  markAllRead: () => apiFetch('/notifications/read-all', { method: 'POST' }),
  /** POST /notifications/push-tokens — register this device's Expo push token. */
  registerPushToken: (token: string, platform?: string) =>
    apiFetch('/notifications/push-tokens', { method: 'POST', body: { token, platform } }),
  /** DELETE /notifications/push-tokens — unregister on sign-out. */
  removePushToken: (token: string) =>
    apiFetch('/notifications/push-tokens', { method: 'DELETE', body: { token } }),
};
