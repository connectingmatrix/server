import { GraphQLOperationType, resolver } from '@connectingmatrix/graphql-parser';
import { Service } from 'typedi';
import { GraphqlResolverContext } from '@giga/shared/types';
import { invalidateGraphqlCache, runNamedGraphqlCache } from '@giga/shared/cache';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';
import { createBillingCheckoutSession, finalizeOrganizationSignup, readBillingAccessState } from '@giga/general/services/billing/runtime/service';
import { getResolverAuthContext, GraphqlCustomResolverModule } from './base';

@Service()
export class BillingResolver extends GraphqlCustomResolverModule {
  @resolver('billingAccessState', GraphQLOperationType.QUERY)
  async billingAccessState({ input }: { input?: { organizationId?: string | null } | null } = {}, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    return runNamedGraphqlCache({
      effectiveRoot,
      operationName: 'billingAccessState',
      read: () => readBillingAccessState(SupabaseClientAdmin(), userId, input?.organizationId || null, effectiveRoot),
      userId,
      variables: {
        input: {
          organizationId: input?.organizationId || null,
        },
      },
    });
  }

  @resolver('billingCreateCheckoutSession', GraphQLOperationType.MUTATION)
  async billingCreateCheckoutSession(
    { input }: { input: { planId: string; termId?: string | null; organizationId?: string | null; seatQuantity?: number | null } },
    context: GraphqlResolverContext,
  ) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    const result = await createBillingCheckoutSession(context.supabase, context.request, userId, input, effectiveRoot);
    invalidateGraphqlCache(['billing:']);
    return result;
  }

  @resolver('finalizeOrganizationSignup', GraphQLOperationType.MUTATION)
  async finalizeOrganizationSignup(
    { input }: { input: { slug: string; name: string; description?: string | null } },
    context: GraphqlResolverContext,
  ) {
    const { userId } = await getResolverAuthContext(context);
    const result = await finalizeOrganizationSignup(context.supabase, userId, input);
    invalidateGraphqlCache(['billing:', 'settings:']);
    return result;
  }
}
