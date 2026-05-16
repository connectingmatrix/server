import { Request } from 'express';
import { getCurrentUserIdOrThrow, isCurrentUserRootUser } from '@giga/shared/lib/helper';
import { SupabaseClient } from '@giga/general/decorators/integration/supabase-client';
import type { GraphqlResolverContext } from '@giga/shared/types/contracts/graphql.types';

export type GigaMcpContext = GraphqlResolverContext & {
  supabase: any;
};

export const createGigaMcpContext = async (request: Request): Promise<GigaMcpContext> => {
  const supabase = (request as any).supabase || (await SupabaseClient(request));
  const userId = (request as any).userId || (await getCurrentUserIdOrThrow(supabase));
  const effectiveRoot = (request as any).effectiveRoot === true || (await isCurrentUserRootUser(supabase));
  return {
    request,
    supabase,
    body: request.body || {},
    graphqlContext: (request as any).context || null,
    userId,
    effectiveRoot,
  };
};
