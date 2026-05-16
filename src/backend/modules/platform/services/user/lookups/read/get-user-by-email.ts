import { SupabaseClient } from '@supabase/supabase-js';
import { BadRequestError } from 'routing-controllers';
import { readUsersByEmail } from './read-users-by-email';

export async function getUserByEmail(supabase: SupabaseClient, email: string) {
  const rows = await readUsersByEmail(supabase, email);
  if (!rows.length) {
    return null;
  }
  if (rows.length > 1) {
    throw new BadRequestError('Multiple users share this email. Use organization member candidates to choose the correct account.');
  }
  return rows[0];
}
