import { GraphQLOperationType, resolver } from '@connectingmatrix/graphql-parser';
import { BadRequestError } from 'routing-controllers';
import { Service } from 'typedi';
import { OrganizationMemberEntity } from '@connectingmatrix/orm/repositories/entities';
import { readCachedEffectiveAIPolicy } from '@giga/plan-policy/services/plan-policy/read/read-effective';
import { readScopedPostCount } from '@giga/plan-policy/services/plan-policy/runtime/database-limits';
import {
  readScopedChannelCount,
  readScopedLinkCount,
  readScopedShareCount,
  readScopedSubjectCount,
} from '@giga/plan-policy/services/plan-policy/runtime/graph-limits';
import { readAIPolicyUsageCount } from '@giga/plan-policy/services/plan-policy/runtime/usage';
import { readRootPlanPolicyConfig, saveRootPlanPolicy } from '@giga/plan-policy/services/plan-policy/runtime/storage';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';
import { getResolverAuthContext, GraphqlCustomResolverModule, requireRootUser } from './base';
import type { GraphqlResolverContext } from '@giga/shared/types';
import type { PlanPolicyLimitMap, PlanPolicyPermissionMap, PlanPolicyTargetId } from '@giga/shared/types/contracts/plan-policy.types';

type EffectivePolicyUsage = {
  BUSINESS_LITE_INCLUDED_USERS: number;
  BUSINESS_LITE_MAX_TOTAL_USERS: number;
  CHANNEL_COUNT: number;
  CONCURRENT_EXECUTIONS_PER_USER: number;
  MAX_LINKAGES: number;
  MAX_SHARING: number;
  MAX_WORKFLOW_AI_CREDITS_PER_BILLING_PERIOD: number;
  ORG_SHARED_SPACE_BYTES: number;
  POST_COUNT: number;
  SUBJECT_COUNT: number;
  WORKFLOW_EXECUTION_TIME_SECONDS: number;
};

const readEffectiveUsage = async (
  context: GraphqlResolverContext,
  input: { organizationId?: string | null; userId: string; billingPeriodStart?: string | null; billingPeriodEnd?: string | null },
): Promise<EffectivePolicyUsage> => {
  const organizationId = input.organizationId || null;
  const memberCount = organizationId ? await OrganizationMemberEntity.countByOrganizationId(organizationId) : 1;
  const [channels, subjects, posts, shares, links, credits] = await Promise.all([
    readScopedChannelCount({ organizationId, userId: input.userId }),
    readScopedSubjectCount({ organizationId, userId: input.userId }),
    readScopedPostCount(context.supabase, { organizationId, userId: input.userId }),
    readScopedShareCount({ organizationId, userId: input.userId }),
    readScopedLinkCount({ organizationId, userId: input.userId }),
    readAIPolicyUsageCount(context.supabase, {
      organizationId,
      userId: input.userId,
      billingPeriodStart: input.billingPeriodStart || null,
      billingPeriodEnd: input.billingPeriodEnd || null,
    }),
  ]);
  return {
    BUSINESS_LITE_INCLUDED_USERS: memberCount,
    BUSINESS_LITE_MAX_TOTAL_USERS: memberCount,
    CHANNEL_COUNT: channels,
    CONCURRENT_EXECUTIONS_PER_USER: 0,
    MAX_LINKAGES: links,
    MAX_SHARING: shares,
    MAX_WORKFLOW_AI_CREDITS_PER_BILLING_PERIOD: credits,
    ORG_SHARED_SPACE_BYTES: 0,
    POST_COUNT: posts,
    SUBJECT_COUNT: subjects,
    WORKFLOW_EXECUTION_TIME_SECONDS: 0,
  };
};

const readPlanPolicyTargetId = (value: string): PlanPolicyTargetId => {
  if (value === 'starter-pack' || value === 'pro' || value === 'business-lite' || value === 'business' || value === 'business-lite-seat')
    return value;
  throw new BadRequestError(`Unsupported plan policy target ${value}.`);
};

type SaveRootPlanPolicyConfigResolverInput = {
  limitations?: PlanPolicyLimitMap;
  mode: 'PAID' | 'TRIAL';
  nodeRestrictions?: string[];
  permissions?: PlanPolicyPermissionMap;
  planId: string;
  scope: 'USER' | 'ORGANIZATION';
  trialDays?: number | null;
};

@Service()
export class PlanPolicyResolver extends GraphqlCustomResolverModule {
  @resolver('effectiveAIPolicy', GraphQLOperationType.QUERY)
  async effectiveAIPolicy({ organizationId }: { organizationId?: string | null } = {}, context: GraphqlResolverContext) {
    const { effectiveRoot, userId } = await getResolverAuthContext(context);
    const policy = await readCachedEffectiveAIPolicy(context, { effectiveRoot, organizationId: organizationId || null, userId });
    return {
      billingPeriodEnd: policy.billingPeriodEnd,
      billingPeriodStart: policy.billingPeriodStart,
      businessLiteSeatCount: policy.businessLiteSeatCount,
      limitations: policy.limitations,
      mode: policy.mode,
      nodeRestrictions: policy.nodeRestrictions || [],
      permissions: policy.permissions,
      planId: policy.planId,
      purchasedSeatCount: policy.purchasedSeatCount,
      scope: policy.scope,
      trialDays: policy.trialDays,
      usage: await readEffectiveUsage(context, {
        billingPeriodEnd: policy.billingPeriodEnd,
        billingPeriodStart: policy.billingPeriodStart,
        organizationId: organizationId || null,
        userId,
      }),
    };
  }

  @resolver('rootPlanPolicyConfig', GraphQLOperationType.QUERY)
  async rootPlanPolicyConfig(_payload: Record<string, string>, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    await requireRootUser(context);
    return readRootPlanPolicyConfig(SupabaseClientAdmin());
  }

  @resolver('saveRootPlanPolicyConfig', GraphQLOperationType.MUTATION)
  async saveRootPlanPolicyConfig(
    {
      input,
    }: {
      input: SaveRootPlanPolicyConfigResolverInput;
    },
    context: GraphqlResolverContext,
  ) {
    await getResolverAuthContext(context);
    await requireRootUser(context);
    if (input.mode === 'TRIAL' && (input.trialDays === null || input.trialDays === undefined || Number(input.trialDays) < 0)) {
      throw new BadRequestError('trialDays is required for trial plan policies.');
    }
    return saveRootPlanPolicy(SupabaseClientAdmin(), {
      id: '',
      limitations: input.limitations || {},
      mode: input.mode,
      nodeRestrictions: input.nodeRestrictions || [],
      permissions: input.permissions || {},
      planId: readPlanPolicyTargetId(input.planId),
      scope: input.scope,
      trialDays: input.mode === 'TRIAL' ? Number(input.trialDays) : null,
      updatedAt: null,
    });
  }
}
