/**
 * Document upload — writes to the SAME private Supabase Storage bucket the
 * candidate portal uses (`candidate-documents`), under the user's own folder so
 * the existing per-user RLS policies (auth.uid() = first path segment) apply.
 *
 * Flow: pick file → upload bytes to storage → register via POST /me/documents
 * so it enters the existing compliance workflow (admin verify, expiry, etc.).
 */
import { supabase } from '@/lib/supabase';

const BUCKET = 'candidate-documents';

export interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string;
}

export async function uploadCandidateDocument(file: PickedFile): Promise<{
  path: string;
  fileName: string;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user.id;
  if (!uid) throw new Error('You are not signed in.');

  // Read the local file into bytes (works for Expo file:// URIs).
  const resp = await fetch(file.uri);
  const arrayBuffer = await resp.arrayBuffer();

  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_');
  const path = `${uid}/${Date.now()}_${safeName}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, arrayBuffer, {
    contentType: file.mimeType || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw new Error(error.message);

  return { path, fileName: file.name };
}

/** Short-lived signed URL to preview a stored document. */
export async function signedDocumentUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}
