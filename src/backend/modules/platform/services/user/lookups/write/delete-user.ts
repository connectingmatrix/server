import { SupabaseClient } from '@supabase/supabase-js';
import { BadRequestError } from 'routing-controllers';
import { UserEntity } from '@connectingmatrix/orm/repositories/entities';
import { getErrorMessage } from '@giga/general/services/user/shared';

export async function deleteUser(supabase: SupabaseClient, id: string) {
  try {
    const { error: authError } = await supabase.auth.admin.deleteUser(id);
    if (authError) {
      throw new BadRequestError(authError.message);
    }

    await UserEntity.deleteById(id);

    return {
      message: 'User deleted successfully',
    };
  } catch (error: unknown) {
    throw new BadRequestError(getErrorMessage(error, 'Failed to delete user'));
  }
}
