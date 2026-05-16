import { SupabaseClient } from '@supabase/supabase-js';
import { BadRequestError } from 'routing-controllers';
import { UserEntity } from '@connectingmatrix/orm/repositories/entities';
import { getErrorMessage } from '@giga/general/services/user/shared';

export async function getAllUsers(
  supabase: SupabaseClient,
  page: number = 1,
  limit: number = 10,
  sortOrder: string = 'asc',
  sortField: string = 'name',
  searchQuery?: string,
  role?: string,
  isVerified?: boolean,
) {
  try {
    const from = (page - 1) * limit;
    const result = await UserEntity.findByFilter({ first: limit, offset: from });
    const filtered = result.data
      .filter((row: any) =>
        searchQuery && searchQuery.trim()
          ? [row.name, row.email, row.username].some((value) =>
              String(value || '')
                .toLowerCase()
                .includes(searchQuery.toLowerCase()),
            )
          : true,
      )
      .filter((row: any) => (role ? String(row?.Role?.name || '') === role : true))
      .filter((row: any) => (typeof isVerified === 'boolean' ? row.isVerified === isVerified : true))
      .sort((left: any, right: any) => {
        const leftValue = String(left?.[sortField] || '');
        const rightValue = String(right?.[sortField] || '');
        return sortOrder === 'asc' ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
      });

    return {
      data: filtered,
      count: result.count || 0,
      page,
      limit,
      totalPages: Math.ceil((result.count || 0) / limit),
    };
  } catch (error: unknown) {
    throw new BadRequestError(getErrorMessage(error, 'Failed to fetch users'));
  }
}
