import { SupabaseClient } from '@supabase/supabase-js';
import { BadRequestError } from 'routing-controllers';
import { UserEntity } from '@connectingmatrix/orm/repositories/entities';
import { getErrorMessage } from '@giga/general/services/user/shared';

export async function getUserByUsername(supabase: SupabaseClient, username: string) {
  try {
    const user = await UserEntity.findByUsername(username);
    if (!user) {
      throw new BadRequestError('User not found');
    }
    return user;
  } catch (error: unknown) {
    throw new BadRequestError(getErrorMessage(error, 'Failed to fetch user'));
  }
}
