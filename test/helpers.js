import { createClient } from '@supabase/supabase-js';

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} no definido en .env.test`);
  return v;
}

export function anonClient() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(requireEnv('SUPABASE_URL'), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const TEST_ORG_ID = process.env.TEST_ORG_ID || 'a1000000-0000-0000-0000-000000000001';
export const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'https://api.aismartcontent.io';
