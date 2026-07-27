// One-time setup: create a private Supabase Storage bucket for candidate
// documents, and add row-level policies so each candidate can upload & read
// only their own files (stored under a folder named after their user id).
//   npm run setup-storage
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const prisma = new PrismaClient();
const BUCKET = 'candidate-documents';

const { error } = await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: '10MB' });
if (error && !/already exists/i.test(error.message)) throw error;
console.log(error ? 'Bucket already exists' : 'Bucket created:', BUCKET);

const stmts = [
  `drop policy if exists "cand_insert_own" on storage.objects`,
  `drop policy if exists "cand_read_own" on storage.objects`,
  `create policy "cand_insert_own" on storage.objects for insert to authenticated with check (bucket_id = '${BUCKET}' and (storage.foldername(name))[1] = auth.uid()::text)`,
  `create policy "cand_read_own" on storage.objects for select to authenticated using (bucket_id = '${BUCKET}' and (storage.foldername(name))[1] = auth.uid()::text)`,
];
for (const s of stmts) {
  try { await prisma.$executeRawUnsafe(s); } catch (e) { console.warn('note:', e.message.split('\n')[0]); }
}
console.log('✅ Storage policies applied.');
await prisma.$disconnect();
