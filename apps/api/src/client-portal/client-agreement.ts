import { CLIENT_TOB_TEXT, CLIENT_TOB_VERSION } from './client-terms-of-business';

/**
 * The canonical Starff client agreement = the full Terms of Business. The
 * version + full text are snapshotted onto the Client at sign-time so the signed
 * agreement can always be reproduced exactly as it was accepted.
 */
export const CLIENT_AGREEMENT = {
  version: CLIENT_TOB_VERSION,
  title: 'Starff — Client Terms of Business',
  text: CLIENT_TOB_TEXT,
  authorisation: (companyName: string) =>
    `I am authorised to accept these Terms of Business on behalf of ${companyName}.`,
};

/** Full-text snapshot stored at sign-time (reproduces exactly what was agreed). */
export function clientAgreementSnapshot(companyName: string): string {
  return `${CLIENT_AGREEMENT.text}\n\n${CLIENT_AGREEMENT.authorisation(companyName)}`;
}
