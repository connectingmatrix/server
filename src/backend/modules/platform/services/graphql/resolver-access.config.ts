import { OrganizationMemberEntity } from '@connectingmatrix/orm/repositories/entities';
import { RESOURCE_TYPES } from '@giga/shared/types/contracts/graph.types';
import { readScopedPostCount } from '@giga/plan-policy/services/plan-policy/runtime/database-limits';
import {
  readScopedChannelCount,
  readScopedLinkCount,
  readScopedShareCount,
  readScopedSubjectCount,
} from '@giga/plan-policy/services/plan-policy/runtime/graph-limits';
import { PermissionContextKey } from '@giga/general/services/graphql/resolver-access.constants';
import {
  readPlanOrganizationIdForChannel,
  readPlanOrganizationIdForPost,
  readPlanOrganizationIdForResource,
  readPlanOrganizationIdForSubject,
} from '@giga/general/services/giga/auth/resource-scope';
import type { GraphqlResolverContext } from '@giga/shared/types/contracts/graphql.types';
import type { PlanPolicyLimitKey } from '@giga/shared/types/contracts/plan-policy.types';

export type ResolverAccessConfigEntry = {
  contextKey?: PermissionContextKey;
  resolveLimitChecks?: (
    payload: any,
    context: GraphqlResolverContext,
    userId: string,
  ) => Promise<Array<{ currentCount: number; increment?: number; key: PlanPolicyLimitKey; message: string; organizationId?: string | null }>>;
  resolveScope?: (payload: any, context: GraphqlResolverContext, userId: string) => Promise<{ organizationId?: string | null }>;
};

async function addMemberLimit(payload: any) {
  const organizationId = String(payload?.input?.organizationId || '').trim();
  if (!organizationId) return [];
  const count = await OrganizationMemberEntity.countByOrganizationId(organizationId);
  return [
    {
      currentCount: count,
      key: 'BUSINESS_LITE_MAX_TOTAL_USERS' as const,
      message: 'This Business Lite organization has reached its maximum total users.',
      organizationId,
    },
  ];
}

async function channelLimit(payload: any, _context: GraphqlResolverContext, userId: string) {
  const organizationId = await readPlanOrganizationIdForChannel(payload?.input || {});
  return [
    {
      currentCount: await readScopedChannelCount({ organizationId, userId }),
      key: 'CHANNEL_COUNT' as const,
      message: 'This plan has reached its maximum channels.',
      organizationId,
    },
  ];
}

async function subjectLimit(payload: any, _context: GraphqlResolverContext, userId: string) {
  const organizationId = await subjectCreateOrganizationId(payload);
  return [
    {
      currentCount: await readScopedSubjectCount({ organizationId, userId }),
      key: 'SUBJECT_COUNT' as const,
      message: 'This plan has reached its maximum subjects.',
      organizationId,
    },
  ];
}

async function subjectCreateOrganizationId(payload: any) {
  if (payload?.input?.categoryId) return readPlanOrganizationIdForResource(RESOURCE_TYPES.category, payload.input.categoryId);
  if (payload?.input?.parentSubjectId) return readPlanOrganizationIdForResource(RESOURCE_TYPES.subject, payload.input.parentSubjectId);
  return readPlanOrganizationIdForSubject(payload?.input?.metadata);
}

async function postLimit(payload: any, context: GraphqlResolverContext, userId: string) {
  const organizationId = await readPlanOrganizationIdForPost(String(payload?.input?.subject_id || ''));
  return [
    {
      currentCount: await readScopedPostCount(context.supabase, { organizationId, userId }),
      key: 'POST_COUNT' as const,
      message: 'This plan has reached its maximum posts.',
      organizationId,
    },
  ];
}

async function linkLimit(organizationId: string | null, userId: string, increment = 1) {
  return [
    {
      currentCount: await readScopedLinkCount({ organizationId, userId }),
      increment,
      key: 'MAX_LINKAGES' as const,
      message: 'This plan has reached its maximum linkages.',
      organizationId,
    },
  ];
}

async function shareLimit(organizationId: string | null, userId: string) {
  return [
    {
      currentCount: await readScopedShareCount({ organizationId, userId }),
      key: 'MAX_SHARING' as const,
      message: 'This plan has reached its maximum sharing grants.',
      organizationId,
    },
  ];
}

export const RESOLVER_ACCESS_CONFIG: Record<string, ResolverAccessConfigEntry> = {
  mcpExecuteTool: {
    resolveScope: async (payload) => ({
      organizationId: payload?.input?.args?.organizationId || payload?.input?.args?.organization_id || null,
    }),
  },
  aiLinkChannel: {
    resolveScope: async (payload) => ({ organizationId: await readPlanOrganizationIdForChannel(payload?.input || {}) }),
    resolveLimitChecks: async (payload, _context, userId) => linkLimit(await readPlanOrganizationIdForChannel(payload?.input || {}), userId),
  },
  aiUnlinkChannel: {
    resolveScope: async (payload) => ({ organizationId: await readPlanOrganizationIdForChannel(payload?.input || {}) }),
  },
  aiLinkCategoryToChannels: {
    resolveScope: async (payload) => ({
      organizationId: await readPlanOrganizationIdForResource(RESOURCE_TYPES.category, payload?.input?.categoryId),
    }),
    resolveLimitChecks: async (payload, _context, userId) =>
      linkLimit(
        await readPlanOrganizationIdForResource(RESOURCE_TYPES.category, payload?.input?.categoryId),
        userId,
        payload?.input?.channelIds?.length || 1,
      ),
  },
  aiUnlinkCategoryFromChannels: {
    resolveScope: async (payload) => ({
      organizationId: await readPlanOrganizationIdForResource(RESOURCE_TYPES.category, payload?.input?.categoryId),
    }),
  },
  gigaCreateChannel: {
    resolveScope: async (payload) => ({ organizationId: await readPlanOrganizationIdForChannel(payload?.input || {}) }),
    resolveLimitChecks: channelLimit,
  },
  createAiSubject: {
    resolveScope: async (payload) => ({ organizationId: await subjectCreateOrganizationId(payload) }),
    resolveLimitChecks: subjectLimit,
  },
  aiAttachUserPermissions: {
    resolveScope: async (payload) => ({
      organizationId: await readPlanOrganizationIdForResource(payload?.input?.resourceType, payload?.input?.resourceId),
    }),
    resolveLimitChecks: async (payload, _context, userId) =>
      shareLimit(await readPlanOrganizationIdForResource(payload?.input?.resourceType, payload?.input?.resourceId), userId),
  },
  aiLinkSubjectToCategory: {
    resolveScope: async (payload) => ({
      organizationId: await readPlanOrganizationIdForResource(RESOURCE_TYPES.category, payload?.input?.categoryId),
    }),
    resolveLimitChecks: async (payload, _context, userId) =>
      linkLimit(await readPlanOrganizationIdForResource(RESOURCE_TYPES.category, payload?.input?.categoryId), userId),
  },
  aiUnlinkSubjectFromCategory: {
    resolveScope: async (payload) => ({
      organizationId: await readPlanOrganizationIdForResource(RESOURCE_TYPES.category, payload?.input?.categoryId),
    }),
  },
  createAiPost: {
    resolveScope: async (payload) => ({ organizationId: await readPlanOrganizationIdForPost(String(payload?.input?.subject_id || '')) }),
    resolveLimitChecks: postLimit,
  },
  addOrganizationMember: {
    resolveScope: async (payload) => ({ organizationId: payload?.input?.organizationId || null }),
    resolveLimitChecks: async (payload) => addMemberLimit(payload),
  },
  bookmarks: { resolveScope: async () => ({ organizationId: null }) },
  createBookmark: { resolveScope: async () => ({ organizationId: null }) },
  deleteBookmark: { resolveScope: async () => ({ organizationId: null }) },
  ai_workflow_assignmentsCollection: { contextKey: PermissionContextKey.ORGANIZATION_ACCESS },
  deleteFromai_workflow_assignmentsCollection: { contextKey: PermissionContextKey.ORGANIZATION_ACCESS },
  organizationSharedSpace: { resolveScope: async (payload) => ({ organizationId: payload?.organizationId || null }) },
  organizationSharedSpaceFiles: { resolveScope: async (payload) => ({ organizationId: payload?.input?.organizationId || null }) },
  organizationSharedSpaceStat: { resolveScope: async (payload) => ({ organizationId: payload?.input?.organizationId || null }) },
  organizationSharedSpaceCreateFolder: { resolveScope: async (payload) => ({ organizationId: payload?.input?.organizationId || null }) },
  organizationSharedSpaceWriteFile: { resolveScope: async (payload) => ({ organizationId: payload?.input?.organizationId || null }) },
  organizationSharedSpaceDownloadUrl: { resolveScope: async (payload) => ({ organizationId: payload?.input?.organizationId || null }) },
  organizationSharedSpaceCopy: { resolveScope: async (payload) => ({ organizationId: payload?.input?.organizationId || null }) },
  organizationSharedSpaceMove: { resolveScope: async (payload) => ({ organizationId: payload?.input?.organizationId || null }) },
  organizationSharedSpaceDelete: { resolveScope: async (payload) => ({ organizationId: payload?.input?.organizationId || null }) },
};
