import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './js/config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'sb-platform-auth',
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});
