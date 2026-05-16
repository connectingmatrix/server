import { GraphQLOperationType, resolver } from '@connectingmatrix/graphql-parser';
import { Service } from 'typedi';
import { GraphqlResolverContext, EnsureGettingStartedOnboardingArgs, GettingStartedOnboardingPayload } from '@giga/shared/types';
import { ensureGettingStartedOnboarding } from '@giga/general/services/user/onboarding/systems/service';
import { getResolverAuthContext, GraphqlCustomResolverModule } from './base';

@Service()
export class OnboardingResolver extends GraphqlCustomResolverModule {
  @resolver('ensureGettingStartedOnboarding', GraphQLOperationType.MUTATION)
  async ensureGettingStartedOnboarding(
    _args: EnsureGettingStartedOnboardingArgs,
    context: GraphqlResolverContext,
  ): Promise<GettingStartedOnboardingPayload> {
    const { userId } = await getResolverAuthContext(context);
    return ensureGettingStartedOnboarding(context.supabase, userId);
  }
}
