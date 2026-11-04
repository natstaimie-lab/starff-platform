import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { PrismaService } from '../prisma/prisma.service';
import { toReadableImage } from './document-media';

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

  constructor(private readonly prisma: PrismaService) {}

  /** Fire-and-forget: never throws into the caller (e.g. the upload flow). */
  runInBackground(documentId: string): void {
    this.check(documentId).catch((e) =>
      this.logger.warn(`pre-check failed for ${documentId}: ${(e as Error).message}`),
    );
  }

  private expected(type: string): string {
    const map: Record<string, string> = {
      RIGHT_TO_WORK: 'a UK right-to-work document — a share-code printout from gov.uk/prove-your-right-to-work, a passport, or other valid proof of immigration status',
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

    const stamp = (verdict: string, summary: string, reason?: string, docFingerprint?: string) =>
      this.prisma.candidateDocument.update({
        where: { id: documentId },
        data: {
          aiCheckVerdict: verdict,
          aiCheckSummary: summary,
          aiCheckReason: reason ?? null,
          aiCheckedAt: new Date(),
          ...(docFingerprint ? { aiDocFingerprint: docFingerprint } : {}),
        },
      });

    // Download the file once: fingerprint it for the duplicate guard (always —
    // even for selfies or when the AI is off), then reuse the bytes for the check.
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    let raw: Buffer | null = null;
    try {
      const dl = await supabase.storage.from('candidate-documents').download(doc.fileUrl);
      if (!dl.error && dl.data) {
        raw = Buffer.from(await dl.data.arrayBuffer());
        const hash = createHash('sha256').update(raw).digest('hex');
        if (hash !== doc.fileHash) {
          await this.prisma.candidateDocument.update({ where: { id: documentId }, data: { fileHash: hash } });
        }
      }
    } catch (e) {
      this.logger.warn(`fingerprint failed for ${documentId}: ${(e as Error).message}`);
    }

    // Selfies are matched visually by a human — no automated facial analysis.
    if (doc.type === 'SELFIE') {
      await stamp('WARN', 'Identity selfie — compare it to the photo ID by eye before verifying.');
      return;
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      this.logger.log('ANTHROPIC_API_KEY not set — skipping document pre-check.');
      return;
    }
    if (!raw) {
      await stamp('WARN', 'Could not open the file to check it — review manually.');
      return;
    }

    // Identify by content, not file name (phones mislabel photos), and turn an
    // iPhone HEIC photo into a JPEG Claude can actually read.
    let readable;
    try {
      readable = await toReadableImage(raw);
    } catch (e) {
      await stamp('WARN', 'Could not decode the image (possibly a corrupt HEIC) — review manually.');
      this.logger.warn(`decode failed for ${documentId}: ${(e as Error).message}`);
      return;
    }
    if (!readable) {
      await stamp('WARN', 'Not a readable image (e.g. a PDF) — open and review manually.');
      return;
    }
    const buf = readable.buffer;
    const mediaType = readable.mediaType;

    const workerName = `${doc.candidate.firstName} ${doc.candidate.lastName}`.trim();
    const today = new Date().toISOString().slice(0, 10);
    const prompt = [
      `This image was uploaded by a temporary worker as ${this.expected(doc.type)}.`,
      `The worker's name on file is "${workerName}". Today's date is ${today}.`,
      'Read the document and reply with ONLY a JSON object, no prose, with these keys:',
      '{ "documentType": string (what the document actually is, e.g. "passport", "driving licence", "BRP"),',
      '  "documentNumber": string or null (the document/reference number — passport no., licence no., BRP no. — digits/letters only, no spaces),',
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
      // Identity fingerprint: hash of document type + number so the duplicate
      // guard can match the same physical document across two different photos,
      // without ever storing the sensitive number itself.
      const normNum = String(r.documentNumber ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const normType = String(r.documentType ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const docFingerprint = normNum.length >= 5 ? createHash('sha256').update(`${normType}|${normNum}`).digest('hex') : undefined;
      // bits = full detail for the reviewer; r.summary = the plain one-sentence
      // reason we can safely show a candidate if the document is rejected.
      await stamp(verdict, bits || 'Checked.', typeof r.summary === 'string' ? r.summary : undefined, docFingerprint);
    } catch (e) {
      await stamp('WARN', 'Automated check could not complete — review manually.');
      this.logger.warn(`pre-check error ${documentId}: ${(e as Error).message}`);
    }
  }
}
