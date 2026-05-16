import { SupabaseClient } from '@supabase/supabase-js';
import { BadRequestError } from 'routing-controllers';
import { UserEntity } from '@connectingmatrix/orm/repositories/entities';
import { getErrorMessage } from '@giga/general/services/user/shared';

export async function readUsersByEmail(supabase: SupabaseClient, email: string) {
  try {
    return UserEntity.findByEmailInsensitive(email);
  } catch (error: unknown) {
    throw new BadRequestError(getErrorMessage(error, 'Failed to fetch user'));
  }
}
