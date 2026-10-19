/**
 * The canonical Starff client Terms of Business — the exact wording a client
 * accepts when they sign. Bump `version` whenever the wording changes; the
 * version + full text are snapshotted onto the Client at sign-time so the signed
 * agreement can always be reproduced exactly as it was agreed.
 */
export const CLIENT_AGREEMENT = {
  version: '2026-10',
  title: 'Starff — Client Terms of Business',
  clauses: [
    'The information provided about our company is accurate and we are authorised to enter this agreement.',
    'We agree to Starff’s terms of business, including charge rates and payment terms once confirmed.',
    'We will approve timesheets promptly and settle invoices within the agreed payment terms.',
  ],
  authorisation: (companyName: string) =>
    `I am authorised to accept Starff’s terms of business on behalf of ${companyName}.`,
};

/** Plain-text snapshot stored at sign-time (reproduces exactly what was agreed). */
export function clientAgreementSnapshot(companyName: string): string {
  const a = CLIENT_AGREEMENT;
  return [
    `${a.title} (version ${a.version})`,
    '',
    'By accepting, the client confirms:',
    ...a.clauses.map((c, i) => `${i + 1}. ${c}`),
    '',
    a.authorisation(companyName),
  ].join('\n');
}
