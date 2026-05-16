/**
 * Builds the normalized organization access context for a user or selected organization.
 * This is where memberships, active organization filtering, denied resource sets, and
 * merged ai_permissions are assembled into one runtime object that downstream checks can use.
 * It feeds access.guard, resolver-access.middleware, and any helper that needs one cached
 * access snapshot instead of repeating membership and permission queries.
 */
import { toSafeString } from 'giga-ai-helper';
import { GigaORM } from '@connectingmatrix/orm/orm';
import { readUserPermissions } from '@giga/permissions/manifest/read-user-permissions';
import { readCachedUserMatrixState } from '@giga/permissions/manifest/user-matrix';
import { OrganisationEntity, OrganizationMemberEntity } from '@connectingmatrix/orm/repositories/entities';
import { markLifecycle } from '@connectingmatrix/logger/lifecycle-jsonl';
import { blankPermissionSummary } from '@giga/general/services/giga/auth/ai-permission-state';
import type { GraphqlResolverContext } from '@giga/shared/types/contracts/graphql.types';
import type { OrganizationAccessContext, OrganizationModule } from '@giga/shared/types/contracts/org.types';

const MODULES = [
  'CHANNEL',
  'CATEGORY',
  'SUBJECT',
  'WEBHOOK',
  'LINKING',
  'SHARING',
  'POST',
  'CHANNEL_CHAT',
  'CATEGORY_CHAT',
  'SUBJECT_CHAT',
  'POST_CHAT',
  'WORKFLOW',
  'ATTACH_WORKFLOW',
  'IMPORT_WORKFLOW_FROM_CATALOG',
  'WORKFLOW_AI_PERMISSIONS',
  'NODE_DESIGNER',
  'CREDENTIAL',
  'ORG_WORKFLOWS',
  'SHARED_SPACE',
] as const;

function ids(items: Array<string | null | undefined>) {
  return items
    .map((item) => toSafeString(item))
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

function deniedByModule() {
  return MODULES.reduce<Record<string, Set<string>>>((acc, module) => ({ ...acc, [module]: new Set<string>() }), {});
}

function emptyContext(permissionScope: 'ORGANIZATION' | 'USER'): OrganizationAccessContext {
  return {
    permissionScope,
    organizationIds: [],
    hasMembership: false,
    isSuperAdmin: false,
    bypassPermissions: false,
    isRestrictedByMembership: false,
    superAdminOrganizationIds: [],
    deniedNodeIds: new Set(),
    deniedSubjectIds: new Set(),
    deniedPostIds: new Set(),
    deniedChannelIds: new Set(),
    deniedCategoryIds: new Set(),
    deniedTargetIdsByModule: deniedByModule(),
    modulePermissions: {},
  };
}

export function getSupportedOrganizationModules(): readonly OrganizationModule[] {
  return MODULES;
}

export async function getActiveOrganizationIds(supabase: any, organizationIdsInput: Array<string | null | undefined>) {
  const organizationIds = ids(organizationIdsInput);
  if (!organizationIds.length) return [];
  const rows = await GigaORM.run({ caller: { id: 'organization-access', type: 'root' } }, () =>
    OrganisationEntity.listActiveRowsByIds(organizationIds),
  );
  return ids(rows.filter((row: any) => row?.isActive !== false).map((row: any) => row?.id));
}

export async function isOrganizationActive(supabase: any, organizationIdInput?: string | null) {
  const organizationId = toSafeString(organizationIdInput);
  if (!organizationId) return false;
  const active = await getActiveOrganizationIds(supabase, [organizationId]);
  return active.includes(organizationId);
}

async function readRestrictions(supabase: any, table: string, orgIds: string[], fieldSelect: string, userId?: string | null) {
  if (!orgIds.length) return [];
  return GigaORM.run({ caller: { id: 'organization-access', type: 'root' } }, () =>
    OrganisationEntity.readRestrictionRows({ table, orgIds, fieldSelect, userId }),
  );
}

export async function getOrganizationAccessContext(
  supabase: any,
  userId: string,
  selectedOrganizationIdInput?: string | null,
  context?: GraphqlResolverContext,
) {
  const lifecycleState = (context?.request as any)?.lifecycleState;
  if (lifecycleState) {
    markLifecycle(lifecycleState, { layer: 'permissions', event: 'organization.access', phase: 'start', transport: 'graphql' });
  }
  try {
    const base = emptyContext(selectedOrganizationIdInput ? 'ORGANIZATION' : 'USER');
    const userIdSafe = toSafeString(userId);
    if (!userIdSafe) {
      if (lifecycleState) {
        markLifecycle(lifecycleState, {
          layer: 'permissions',
          event: 'organization.access',
          phase: 'end',
          transport: 'graphql',
          status: 'passed',
          meta: { organizations_count: 0 },
        });
      }
      return base;
    }
    const selectedOrganizationId = toSafeString(selectedOrganizationIdInput);
    const cacheKey = selectedOrganizationId || 'USER';
    const cached = context?.organizationAccessCache?.[cacheKey];
    if (cached) {
      if (lifecycleState) {
        markLifecycle(lifecycleState, {
          layer: 'permissions',
          event: 'organization.access',
          phase: 'end',
          transport: 'graphql',
          status: 'passed',
          meta: { cache_hit: true },
        });
      }
      return cached;
    }
    const memberships = await GigaORM.run({ caller: { id: 'organization-access', type: 'root' } }, () =>
      OrganizationMemberEntity.listActiveRowsByUserId(userIdSafe),
    );
    const activeIds = await getActiveOrganizationIds(
      supabase,
      memberships.map((item: any) => item.organization_id),
    );
    let organizationIds = ids(
      memberships.filter((item: any) => activeIds.includes(toSafeString(item.organization_id))).map((item: any) => item.organization_id),
    );
    let superAdminOrganizationIds = ids(
      memberships
        .filter((item: any) => item.role === 'SUPER_ADMIN' && activeIds.includes(toSafeString(item.organization_id)))
        .map((item: any) => item.organization_id),
    );
    if (selectedOrganizationId && !organizationIds.includes(selectedOrganizationId)) {
      for (const module of MODULES)
        base.modulePermissions[module] = { allowCreate: false, allowRead: false, allowUpdate: false, allowDelete: false, allowExecute: false };
      base.isRestrictedByMembership = ids(memberships.map((item: any) => item.organization_id)).length > 0;
      if (lifecycleState) {
        markLifecycle(lifecycleState, {
          layer: 'permissions',
          event: 'organization.access',
          phase: 'end',
          transport: 'graphql',
          status: 'passed',
          meta: { restricted: true },
        });
      }
      return base;
    }
    if (selectedOrganizationId) {
      organizationIds = [selectedOrganizationId];
      superAdminOrganizationIds = superAdminOrganizationIds.includes(selectedOrganizationId) ? [selectedOrganizationId] : [];
    }
    base.organizationIds = organizationIds;
    base.hasMembership = organizationIds.length > 0;
    base.isSuperAdmin = superAdminOrganizationIds.length > 0;
    base.superAdminOrganizationIds = superAdminOrganizationIds;
    base.isRestrictedByMembership = ids(memberships.map((item: any) => item.organization_id)).length > 0;
    const permissionState = context
      ? await readCachedUserMatrixState(context, {
          effectiveRoot: context.effectiveRoot === true,
          organizationId: selectedOrganizationId || null,
          userId: userIdSafe,
        })
      : await readUserPermissions(supabase, { organizationId: selectedOrganizationId || null, userId: userIdSafe });
    const [userContent, orgContent, userNodes, orgNodes] = await Promise.all([
      readRestrictions(supabase, 'organization_content_restrictions', organizationIds, 'target_type,target_id', userIdSafe),
      readRestrictions(supabase, 'organization_content_restrictions', organizationIds, 'target_type,target_id'),
      readRestrictions(supabase, 'organization_node_restrictions', organizationIds, 'node_type,node_id', userIdSafe),
      readRestrictions(supabase, 'organization_node_restrictions', organizationIds, 'node_type,node_id'),
    ]);
    for (const row of [...userContent, ...orgContent]) {
      const type = toSafeString((row as any).target_type).toUpperCase();
      const targetId = toSafeString((row as any).target_id);
      if (!type || !targetId) continue;
      if (type === 'CHANNEL') base.deniedChannelIds.add(targetId);
      if (type === 'CATEGORY') base.deniedCategoryIds.add(targetId);
      if (type === 'SUBJECT') base.deniedSubjectIds.add(targetId);
      if (type === 'POST') base.deniedPostIds.add(targetId);
      if (base.deniedTargetIdsByModule[type]) base.deniedTargetIdsByModule[type].add(targetId);
    }
    for (const row of [...userNodes, ...orgNodes]) {
      const nodeId = toSafeString((row as any).node_id);
      if (nodeId) base.deniedNodeIds.add(nodeId);
    }
    for (const module of MODULES) {
      const organizationPermissions = 'organizationPermissions' in permissionState ? permissionState.organizationPermissions[module] : undefined;
      const userPermissions = 'userPermissions' in permissionState ? permissionState.userPermissions[module] : undefined;
      base.modulePermissions[module] = selectedOrganizationId
        ? {
            allowCreate: organizationPermissions?.allowCreate !== false && userPermissions?.allowCreate !== false,
            allowRead: organizationPermissions?.allowRead !== false && userPermissions?.allowRead !== false,
            allowUpdate: organizationPermissions?.allowUpdate !== false && userPermissions?.allowUpdate !== false,
            allowDelete: organizationPermissions?.allowDelete !== false && userPermissions?.allowDelete !== false,
            allowExecute: organizationPermissions?.allowExecute !== false && userPermissions?.allowExecute !== false,
          }
        : userPermissions || blankPermissionSummary();
    }
    if (context) context.organizationAccessCache = { ...(context.organizationAccessCache || {}), [cacheKey]: base };
    if (lifecycleState) {
      markLifecycle(lifecycleState, {
        layer: 'permissions',
        event: 'organization.access',
        phase: 'end',
        transport: 'graphql',
        status: 'passed',
        meta: { organizations_count: base.organizationIds.length },
      });
    }
    return base;
  } catch (error) {
    if (lifecycleState) {
      markLifecycle(lifecycleState, { layer: 'permissions', event: 'organization.access', phase: 'error', transport: 'graphql', status: 'failed' });
    }
    throw error;
  }
}
