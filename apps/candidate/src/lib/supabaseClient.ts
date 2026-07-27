'use client';

import { createClient } from '@supabase/supabase-js';

// One browser-side Supabase client. Handles login and keeps the session.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
