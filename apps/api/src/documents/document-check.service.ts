import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Automated document pre-check — an ASSIST for the admin, never an auto-verify.
 * Reads the uploaded document with Claude vision and reports whether the name
 * matches the worker, whether it's the expected type, whether it's expired, and
 * whether it's legible — so staff can approve/reject with confidence. The human
 * still makes the decision (platform rule: admin is the decision-maker).
 *
 * Deliberately does NOT do facial recognition / selfie-to-ID matching — that is
 * against Anthropic's usage policy and is not a reliable biometric check. The
 * selfie stays a human visual match (the admin preview shows it next to the ID).
 */
@Injectable()
export class DocumentCheckService {
  private readonly logger = new Logger('DocumentCheck');

  // Claude vision image types we can inline.
  private static readonly IMG = /\.(jpe?g|png|webp|gif)$/i;

  constructor(private readonly prisma: PrismaService) {}

  /** Fire-and-forget: never throws into the caller (e.g. the upload flow). */
  runInBackground(documentId: string): void {
    this.check(documentId).catch((e) =>
      this.logger.warn(`pre-check failed for ${documentId}: ${(e as Error).message}`),
    );
  }

  private expected(type: string): string {
    const map: Record<string, string> = {
      RIGHT_TO_WORK: 'a UK right-to-work document (passport, BRP, visa or share-code printout)',
      ID: 'a photo ID (passport or driving licence)',
      DBS_CHECK: 'a DBS certificate',
      CV: 'a CV / work history',
      LICENCE: 'a licence (e.g. SIA, CSCS, driving)',
      QUALIFICATION: 'a qualification certificate',
      CERTIFICATE: 'a certificate',
    };
    return map[type] ?? `a ${type.toLowerCase().replace(/_/g, ' ')} document`;
  }

  async check(documentId: string): Promise<void> {
    const doc = await this.prisma.candidateDocument.findUnique({
      where: { id: documentId },
      include: { candidate: { select: { firstName: true, lastName: true } } },
    });
    if (!doc) return;

    const stamp = (verdict: string, summary: string) =>
      this.prisma.candidateDocument.update({
        where: { id: documentId },
        data: { aiCheckVerdict: verdict, aiCheckSummary: summary, aiCheckedAt: new Date() },
      });

    // Selfies are matched visually by a human — no automated facial analysis.
    if (doc.type === 'SELFIE') {
      await stamp('WARN', 'Identity selfie — compare it to the photo ID by eye before verifying.');
      return;
    }
    if (!DocumentCheckService.IMG.test(doc.fileName ?? doc.fileUrl)) {
      await stamp('WARN', 'Not an image (e.g. PDF) — open and review manually.');
      return;
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      this.logger.log('ANTHROPIC_API_KEY not set — skipping document pre-check.');
      return;
    }

    // Pull the file from the private bucket.
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const dl = await supabase.storage.from('candidate-documents').download(doc.fileUrl);
    if (dl.error || !dl.data) {
      await stamp('WARN', 'Could not open the file to check it — review manually.');
      return;
    }
    const buf = Buffer.from(await dl.data.arrayBuffer());
    const ext = (doc.fileName ?? doc.fileUrl).toLowerCase();
    const mediaType = ext.endsWith('.png') ? 'image/png'
      : ext.endsWith('.webp') ? 'image/webp'
      : ext.endsWith('.gif') ? 'image/gif' : 'image/jpeg';

    const workerName = `${doc.candidate.firstName} ${doc.candidate.lastName}`.trim();
    const today = new Date().toISOString().slice(0, 10);
    const prompt = [
      `This image was uploaded by a temporary worker as ${this.expected(doc.type)}.`,
      `The worker's name on file is "${workerName}". Today's date is ${today}.`,
      'Read the document and reply with ONLY a JSON object, no prose, with these keys:',
      '{ "documentType": string (what the document actually is),',
      '  "nameOnDocument": string or null,',
      '  "nameMatches": boolean (does it match the name on file, allowing for middle names/initials),',
      '  "expiryDate": string YYYY-MM-DD or null,',
      '  "expired": boolean (true if expiryDate is before today),',
      '  "legible": boolean (is the document clear and fully readable),',
      '  "verdict": "PASS" | "WARN" | "FAIL",',
      '  "summary": string (one short sentence for a reviewer) }',
      'Use FAIL if it is the wrong type, expired, or the name clearly does not match;',
      'WARN if anything is unclear or unreadable; PASS only if it looks correct, legible and current.',
      'Do not identify or match any person from their face; judge the document text only.',
    ].join('\n');

    try {
      const client = new Anthropic();
      const resp = await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType as any, data: buf.toString('base64') } },
            { type: 'text', text: prompt },
          ],
        }],
      });
      const text = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim();
      const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
      const r = JSON.parse(json);
      const verdict = ['PASS', 'WARN', 'FAIL'].includes(r.verdict) ? r.verdict : 'WARN';
      const bits = [
        r.summary,
        r.nameOnDocument ? `Name on doc: ${r.nameOnDocument}${r.nameMatches ? ' (matches)' : ' (does NOT match)'}.` : null,
        r.expiryDate ? `Expiry: ${r.expiryDate}${r.expired ? ' — EXPIRED' : ''}.` : null,
        r.legible === false ? 'Hard to read — may need a clearer copy.' : null,
      ].filter(Boolean).join(' ');
      await stamp(verdict, bits || 'Checked.');
    } catch (e) {
      await stamp('WARN', 'Automated check could not complete — review manually.');
      this.logger.warn(`pre-check error ${documentId}: ${(e as Error).message}`);
    }
  }
}
