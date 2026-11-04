/** The reference clients see for a worker, alongside their first name only. */
export function candidateReference(candidateId: string): string {
  return `C-${candidateId.slice(-6).toUpperCase()}`;
}
