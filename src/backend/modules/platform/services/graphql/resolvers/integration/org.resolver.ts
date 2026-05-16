import { GraphQLOperationType, resolver } from '@connectingmatrix/graphql-parser';
import {
  AIPermissionRow,
  AIPermissionsInput,
  DeleteUserArgs,
  DeleteAIPermissionInput,
  GraphqlResolverContext,
  OrganizationContentRestrictionDeleteInput,
  OrganizationContentRestrictionInput,
  OrganizationInput,
  OrganizationMemberDisableInput,
  OrganizationMemberInput,
  OrganizationMemberRoleInput,
  OrganizationNodeRestrictionDeleteInput,
  OrganizationNodeRestrictionInput,
  OrganizationsInput,
  RootIdentityInput,
  UpsertAIPermissionInput,
  UserByEmailArgs,
  UserByIdArgs,
  UserByUsernameArgs,
  UsersArgs,
  WorkflowContextMenuOptionsInput,
} from '@giga/shared/types';
import { Service } from 'typedi';
import { BadRequestError } from 'routing-controllers';
import { invalidateGraphqlCache, runNamedGraphqlCache } from '@giga/shared/cache';
import { clearUserAccessCache } from '@giga/permissions/manifest/user-access-cache';
import { clearUserMatrixCache } from '@giga/permissions/manifest/user-matrix';
import {
  AppRootUserEntity,
  OrganisationEntity,
  OrganizationContentRestrictionEntity,
  OrganizationMemberEntity,
  OrganizationNodeRestrictionEntity,
  PermissionEntity,
  UserEntity,
  WorkflowEntity,
} from '@connectingmatrix/orm/repositories/entities';
import { GigaORM } from '@connectingmatrix/orm/orm';
import { deleteUser } from '@giga/general/services/user/lookups/write/delete-user';
import { readOrganizationBillingMeta } from '@giga/general/services/billing';
import {
  buildWorkflowMenuOptionsForUser,
  canOrganizationAction,
  getResolverAuthContext,
  getCurrentUserOrganizationContext,
  GraphqlCustomResolverModule,
  requireOrganizationManagerRole,
} from './base';

const formatAIPermission = (row: PermissionEntity) => ({
  id: row.id,
  scope: row.scope as AIPermissionRow['scope'],
  organizationId: row.organization_id || null,
  userId: row.user_id || null,
  module: row.module,
  canCreate: row.can_create ?? null,
  canRead: row.can_read ?? null,
  canUpdate: row.can_update ?? null,
  canDelete: row.can_delete ?? null,
  canExecute: row.can_execute ?? null,
});

const invalidateSettingsGraphqlCache = (organizationId?: string | null) => {
  const tags = ['settings:'];
  if (organizationId) {
    tags.push(`org:${organizationId}:settings`, 'billing:');
  }
  clearUserAccessCache();
  clearUserMatrixCache();
  invalidateGraphqlCache(tags);
};

const readRootIdentityData = async (input: { includeInactive?: boolean }, effectiveRoot: boolean) => {
  let query = AppRootUserEntity.find().select('id,user_id,email,is_active');
  if (input.includeInactive !== true) query = query.where({ is_active: true });
  const rows = await query.many();
  const activeRows = rows.filter((row) => row.is_active === true);
  const activeRoot = activeRows[0];
  return {
    activeRootCount: activeRows.length,
    isRootUser: effectiveRoot,
    rootUser: rows.length
      ? {
          userId: activeRoot?.user_id || null,
          email: activeRoot?.email || null,
        }
      : null,
  };
};

const readOrganizationMembersData = async (organizationId: string) => {
  const rows = await OrganizationMemberEntity.listForOrganization(organizationId);
  const ids = rows.map((row) => String(row.user_id || '')).filter(Boolean);
  const users = ids.length ? await UserEntity.find().whereIn('id', ids).select('id,email,username,name,firstName,lastName').many() : [];
  const usersById = new Map(users.map((user) => [String(user.id || ''), user]));
  return rows.map((row) => {
    const user = usersById.get(String(row.user_id || '')) || null;
    const name = String(
      user?.name || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.username || user?.email || row.user_id || '',
    );
    return {
      id: row.id,
      organizationId: row.organization_id,
      userEmail: user?.email || null,
      userId: row.user_id,
      userName: name || null,
      userUsername: user?.username || null,
      role: row.role || 'MEMBER',
      isDisabled: row.is_disabled === true,
      metadata: row.metadata || {},
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
    };
  });
};

const readOrganizationMemberCandidatesData = (organizationId: string, email: string) => UserEntity.memberCandidates({ organizationId, email });

const readOrganizationNodeRestrictionsData = async (input: { organizationId?: string | null; userId?: string | null }) => {
  const rows = await OrganizationNodeRestrictionEntity.listForOrganization({
    organizationId: input.organizationId || null,
    userId: input.userId || null,
  });
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id || null,
    userId: row.user_id || null,
    nodeType: row.node_type,
    nodeId: row.node_id,
    reason: row.reason || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }));
};

const readOrganizationContentRestrictionsData = async (input: { organizationId?: string | null; userId?: string | null }) => {
  const rows = await OrganizationContentRestrictionEntity.listForOrganization({
    organizationId: input.organizationId || null,
    userId: input.userId || null,
  });
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id || null,
    userId: row.user_id || null,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }));
};

const readWorkflowContextMenuOptionsData = async (
  workflowId: string | null,
  userId: string,
  effectiveRoot: boolean,
  context: GraphqlResolverContext,
) => {
  const access = await getCurrentUserOrganizationContext(context);
  if (!workflowId) {
    return buildWorkflowMenuOptionsForUser({
      canEditDefaultWorkflow: effectiveRoot,
      canEditUserWorkflow: effectiveRoot || canOrganizationAction(access, 'WORKFLOW', 'update'),
    });
  }
  const workflow = await WorkflowEntity.readActiveRowById(workflowId);
  if (!workflow?.id || workflow.is_active === false) return [];
  if (workflow.is_global === true) {
    return buildWorkflowMenuOptionsForUser({
      canEditDefaultWorkflow: effectiveRoot,
      canEditUserWorkflow: false,
    });
  }
  if (workflow.organization_id) {
    return buildWorkflowMenuOptionsForUser({
      canEditDefaultWorkflow: false,
      canEditUserWorkflow: effectiveRoot || canOrganizationAction(access, 'WORKFLOW', 'update'),
    });
  }
  return buildWorkflowMenuOptionsForUser({
    canEditDefaultWorkflow: false,
    canEditUserWorkflow: workflow.user_id === userId && (effectiveRoot || canOrganizationAction(access, 'WORKFLOW', 'update')),
  });
};

const mapOrganizationRow = (row: OrganisationEntity) => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description,
  isActive: row.isActive,
  billingStatus: row.billingStatus,
  orgUrl: readOrganizationBillingMeta(row.metadata).orgUrl || null,
  createdBy: row.createdBy,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const createOrganizationData = async (input: OrganizationInput, auth: { userId: string; effectiveRoot: boolean }) => {
  if (!auth.effectiveRoot) throw new BadRequestError('Only root users can create organizations.');
  const row = await OrganisationEntity.createOrganizationData({
    name: input.name,
    slug: input.slug || null,
    description: input.description || null,
    createdBy: auth.userId,
  });
  return mapOrganizationRow(row);
};

const updateOrganizationData = async (input: OrganizationInput, auth: { userId: string; effectiveRoot: boolean }) => {
  if (!auth.effectiveRoot) throw new BadRequestError('Only root users can update organizations.');
  const organizationId = String(input.id || '').trim();
  if (!organizationId) throw new BadRequestError('Organization id is required.');
  const row = await OrganisationEntity.updateOrganizationData({
    id: organizationId,
    name: input.name,
    slug: input.slug || null,
    description: input.description || null,
    isActive: input.isActive === true ? true : input.isActive === false ? false : undefined,
  });
  return mapOrganizationRow(row);
};

const deleteOrganizationData = async (id: string, effectiveRoot: boolean) => {
  if (!effectiveRoot) throw new BadRequestError('Only root users can delete organizations.');
  const organization = await OrganisationEntity.findById(id);
  if (!organization?.id) return { message: `No organization found for id ${id}`, data: null };
  await OrganisationEntity.deleteOrganizationData(id);
  return { message: `Organization ${id} deleted successfully`, data: { id } };
};

const addOrganizationMemberData = async (input: OrganizationMemberInput) => {
  const row = await OrganizationMemberEntity.createOrUpdateByOrganizationAndUser({
    organization_id: input.organizationId,
    user_id: input.userId,
    role: input.role || 'MEMBER',
    is_disabled: false,
    metadata: {},
  });
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role || 'MEMBER',
    isDisabled: row.is_disabled === true,
    metadata: row.metadata || {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
};

const updateOrganizationMemberRoleData = async (input: OrganizationMemberRoleInput) => {
  const row = await OrganizationMemberEntity.updateRole({
    organizationId: input.organizationId,
    userId: input.userId,
    role: input.role,
  });
  if (!row?.id) throw new BadRequestError('Organization member not found.');
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role || 'MEMBER',
    isDisabled: row.is_disabled === true,
    metadata: row.metadata || {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
};

const disableOrganizationMemberData = async (input: OrganizationMemberDisableInput) => {
  const row = await OrganizationMemberEntity.updateByOrganizationAndUser({
    organizationId: input.organizationId,
    userId: input.userId,
    patch: { is_disabled: input.isDisabled === true },
  });
  if (!row?.id) throw new BadRequestError('Organization member not found.');
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role || 'MEMBER',
    isDisabled: row.is_disabled === true,
    metadata: row.metadata || {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
};

const removeOrganizationMemberData = async (input: OrganizationMemberInput) => {
  await OrganizationMemberEntity.removeMember({ organizationId: input.organizationId, userId: input.userId });
  return { organizationId: input.organizationId, deleted: true, message: 'Organization member removed successfully' };
};

const addOrganizationNodeRestrictionData = async (input: OrganizationNodeRestrictionInput, userId: string) => {
  const row = await OrganizationNodeRestrictionEntity.createRestriction({
    id: '',
    organization_id: input.organizationId || null,
    user_id: input.userId || null,
    node_type: input.nodeType,
    node_id: input.nodeId,
    reason: input.reason || null,
    created_by: userId,
  });
  return {
    id: row.id,
    organizationId: row.organization_id || null,
    userId: row.user_id || null,
    nodeType: row.node_type,
    nodeId: row.node_id,
    reason: row.reason || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
};

const removeOrganizationNodeRestrictionData = async (input: OrganizationNodeRestrictionDeleteInput) => {
  const deleted = await OrganizationNodeRestrictionEntity.deleteRestriction({
    organizationId: input.organizationId || null,
    userId: input.userId || null,
    nodeType: input.nodeType,
    nodeId: input.nodeId,
  });
  return {
    organizationId: input.organizationId || null,
    deleted,
    message: deleted ? 'Organization node restriction removed successfully' : 'No organization node restriction found',
  };
};

const addOrganizationContentRestrictionData = async (input: OrganizationContentRestrictionInput, userId: string) => {
  const row = await OrganizationContentRestrictionEntity.createRestriction({
    id: '',
    organization_id: input.organizationId || null,
    user_id: input.userId || null,
    target_type: input.targetType,
    target_id: input.targetId,
    reason: input.reason || null,
    created_by: userId,
  });
  return {
    id: row.id,
    organizationId: row.organization_id || null,
    userId: row.user_id || null,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
};

const removeOrganizationContentRestrictionData = async (input: OrganizationContentRestrictionDeleteInput) => {
  const deleted = await OrganizationContentRestrictionEntity.deleteRestriction({
    organizationId: input.organizationId || null,
    userId: input.userId || null,
    targetType: input.targetType,
    targetId: input.targetId,
  });
  return {
    organizationId: input.organizationId || null,
    deleted,
    message: deleted ? 'Organization content restriction removed successfully' : 'No organization content restriction found',
  };
};

const readUsersData = async (input: {
  page?: number;
  limit?: number;
  sortOrder?: string;
  sortField?: string;
  searchQuery?: string;
  role?: string;
  isVerified?: boolean;
}) => {
  const page = Math.max(1, Number(input.page || 1));
  const limit = Math.max(1, Number(input.limit || 10));
  const result = await UserEntity.list({ first: limit, offset: (page - 1) * limit });
  const count = result.totalCount || 0;
  const totalPages = Math.max(1, Math.ceil(count / limit));
  return {
    data: result.records,
    count,
    page,
    limit,
    totalPages,
  };
};

const readUserByIdData = (id: string) => GigaORM.run({ caller: { id: 'org-user-lookup', type: 'root' } }, () => UserEntity.byId(id));
const readUserByUsernameData = (username: string) =>
  GigaORM.run({ caller: { id: 'org-user-lookup', type: 'root' } }, () => UserEntity.byUsername(username));
const readUserByEmailData = (email: string) => GigaORM.run({ caller: { id: 'org-user-lookup', type: 'root' } }, () => UserEntity.byEmail(email));
const deleteUserData = async (id: string, context: GraphqlResolverContext) => deleteUser(context.supabase, id);

const activeOrganizationIdsForUser = async (input: { userId: string; role?: string }) => {
  const userId = String(input.userId || '').trim();
  if (!userId) return [];
  return GigaORM.run({ caller: { id: 'org-resolver-membership', type: 'root' } }, async () => {
    let membershipQuery = OrganizationMemberEntity.find({ user_id: userId, is_disabled: false });
    if (input.role) membershipQuery = membershipQuery.where({ role: input.role });
    const memberships = await membershipQuery.select('organization_id').many();
    const organizationIds = memberships.map((membership) => String(membership.organization_id || '').trim()).filter(Boolean);
    if (!organizationIds.length) return [];
    const organizations = await OrganisationEntity.find({ isActive: true }).whereIn('id', organizationIds).select('id').many();
    return organizations.map((organization) => String(organization.id || '').trim()).filter(Boolean);
  });
};

const canReadUserRecord = async (input: { actorUserId: string; targetUserId: string; effectiveRoot: boolean }) => {
  if (input.effectiveRoot) return true;
  if (input.actorUserId === input.targetUserId) return true;
  const actorSuperAdminOrganizationIds = await activeOrganizationIdsForUser({ userId: input.actorUserId, role: 'SUPER_ADMIN' });
  if (!actorSuperAdminOrganizationIds.length) return false;
  const sharedMembership = await OrganizationMemberEntity.find({ user_id: input.targetUserId, is_disabled: false })
    .whereIn('organization_id', actorSuperAdminOrganizationIds)
    .select('id')
    .single();
  return Boolean(sharedMembership?.id);
};

const assertCanReadUserRecord = async (input: { actorUserId: string; targetUserId: string; effectiveRoot: boolean }) => {
  const allowed = await canReadUserRecord(input);
  if (!allowed) throw new BadRequestError('Access denied for user lookup.');
};

@Service()
export class OrgResolver extends GraphqlCustomResolverModule {
  @resolver('rootIdentity', GraphQLOperationType.QUERY)
  async rootIdentity({ input }: { input?: RootIdentityInput } = {}, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    return runNamedGraphqlCache({
      effectiveRoot,
      operationName: 'rootIdentity',
      read: () => readRootIdentityData({ includeInactive: input?.includeInactive === true }, effectiveRoot),
      userId,
      variables: {
        input,
      },
    });
  }

  @resolver('organizations', GraphQLOperationType.QUERY)
  async organizations({ input }: { input?: OrganizationsInput } = {}, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    return runNamedGraphqlCache({
      effectiveRoot,
      operationName: 'organizations',
      read: async () => {
        const rows = await OrganisationEntity.listForUser({
          userId,
          id: input?.id || null,
          slug: input?.slug || null,
          isActive: input?.isActive === true ? true : input?.isActive === false ? false : null,
        });
        return rows.map((row) => ({
          id: row.id,
          slug: row.slug,
          name: row.name,
          description: row.description,
          isActive: row.isActive,
          billingStatus: row.billingStatus,
          orgUrl: readOrganizationBillingMeta(row.metadata).orgUrl || null,
          createdBy: row.createdBy,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
      },
      userId,
      variables: {
        input,
        organizationId: input?.id || null,
      },
    });
  }

  @resolver('organizationMembers', GraphQLOperationType.QUERY)
  async organizationMembers({ organizationId }: { organizationId: string }, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    await requireOrganizationManagerRole(context, organizationId);
    return runNamedGraphqlCache({
      effectiveRoot,
      operationName: 'organizationMembers',
      read: () => readOrganizationMembersData(organizationId),
      userId,
      variables: {
        organizationId,
      },
    });
  }

  @resolver('organizationMemberCandidates', GraphQLOperationType.QUERY)
  async organizationMemberCandidates({ organizationId, email }: { organizationId: string; email: string }, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    await requireOrganizationManagerRole(context, organizationId);
    return readOrganizationMemberCandidatesData(organizationId, email);
  }

  @resolver('aiPermissions', GraphQLOperationType.QUERY)
  async aiPermissions({ input }: { input: AIPermissionsInput }, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    if (input.organizationId) await requireOrganizationManagerRole(context, input.organizationId);
    if (input.userId && input.userId !== userId && !effectiveRoot) throw new BadRequestError('Only root users can inspect another user permissions.');
    const rows = await PermissionEntity.findByFilter({ organization_id: input.organizationId || null, user_id: input.userId || userId });
    return rows
      .slice()
      .sort((left, right) =>
        `${left.module}:${left.scope}:${left.user_id || ''}`.localeCompare(`${right.module}:${right.scope}:${right.user_id || ''}`),
      )
      .map(formatAIPermission);
  }

  @resolver('organizationNodeRestrictions', GraphQLOperationType.QUERY)
  async organizationNodeRestrictions(
    {
      organizationId,
      userId,
    }: {
      organizationId?: string | null;
      userId?: string | null;
    },
    context: GraphqlResolverContext,
  ) {
    const { userId: currentUserId, effectiveRoot } = await getResolverAuthContext(context);
    if (organizationId) await requireOrganizationManagerRole(context, organizationId);
    if (userId && userId !== currentUserId && !effectiveRoot) throw new BadRequestError('Only root users can inspect another user restrictions.');
    return runNamedGraphqlCache({
      effectiveRoot,
      operationName: 'organizationNodeRestrictions',
      read: () => readOrganizationNodeRestrictionsData({ organizationId, userId }),
      userId: currentUserId,
      variables: {
        organizationId: organizationId ?? null,
        userId: userId ?? null,
      },
    });
  }

  @resolver('organizationContentRestrictions', GraphQLOperationType.QUERY)
  async organizationContentRestrictions(
    {
      organizationId,
      userId,
    }: {
      organizationId?: string | null;
      userId?: string | null;
    },
    context: GraphqlResolverContext,
  ) {
    const { userId: currentUserId, effectiveRoot } = await getResolverAuthContext(context);
    if (organizationId) await requireOrganizationManagerRole(context, organizationId);
    if (userId && userId !== currentUserId && !effectiveRoot) throw new BadRequestError('Only root users can inspect another user restrictions.');
    return runNamedGraphqlCache({
      effectiveRoot,
      operationName: 'organizationContentRestrictions',
      read: () => readOrganizationContentRestrictionsData({ organizationId, userId }),
      userId: currentUserId,
      variables: {
        organizationId: organizationId ?? null,
        userId: userId ?? null,
      },
    });
  }

  @resolver('workflowContextMenuOptions', GraphQLOperationType.QUERY)
  async workflowContextMenuOptions({ input }: { input?: WorkflowContextMenuOptionsInput }, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    return readWorkflowContextMenuOptionsData(input?.workflowId ?? null, userId, effectiveRoot, context);
  }

  @resolver('createOrganization', GraphQLOperationType.MUTATION)
  async createOrganization({ input }: { input: OrganizationInput }, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    const row = await createOrganizationData(input, { userId, effectiveRoot });
    invalidateSettingsGraphqlCache(row.id);
    return row;
  }

  @resolver('updateOrganization', GraphQLOperationType.MUTATION)
  async updateOrganization({ input }: { input: OrganizationInput }, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    const row = await updateOrganizationData(input, { userId, effectiveRoot });
    invalidateSettingsGraphqlCache(row.id);
    return row;
  }

  @resolver('deleteOrganization', GraphQLOperationType.MUTATION)
  async deleteOrganization({ id }: { id: string }, context: GraphqlResolverContext) {
    const { effectiveRoot } = await getResolverAuthContext(context);
    const result = await deleteOrganizationData(id, effectiveRoot);
    if (result.data?.id) invalidateSettingsGraphqlCache(result.data.id);
    return { message: result.message };
  }

  @resolver('addOrganizationMember', GraphQLOperationType.MUTATION)
  async addOrganizationMember({ input }: { input: OrganizationMemberInput }, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    await requireOrganizationManagerRole(context, input.organizationId);
    const row = await addOrganizationMemberData(input);
    invalidateSettingsGraphqlCache(row.organizationId);
    return row;
  }

  @resolver('updateOrganizationMemberRole', GraphQLOperationType.MUTATION)
  async updateOrganizationMemberRole({ input }: { input: OrganizationMemberRoleInput }, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    await requireOrganizationManagerRole(context, input.organizationId);
    const row = await updateOrganizationMemberRoleData(input);
    invalidateSettingsGraphqlCache(row.organizationId);
    return row;
  }

  @resolver('disableOrganizationMember', GraphQLOperationType.MUTATION)
  async disableOrganizationMember({ input }: { input: OrganizationMemberDisableInput }, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    await requireOrganizationManagerRole(context, input.organizationId);
    const row = await disableOrganizationMemberData(input);
    invalidateSettingsGraphqlCache(row.organizationId);
    return row;
  }

  @resolver('removeOrganizationMember', GraphQLOperationType.MUTATION)
  async removeOrganizationMember({ input }: { input: OrganizationMemberInput }, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    await requireOrganizationManagerRole(context, input.organizationId);
    const result = await removeOrganizationMemberData(input);
    invalidateSettingsGraphqlCache(result.organizationId);
    return { message: result.message };
  }

  @resolver('upsertAIPermission', GraphQLOperationType.MUTATION)
  async upsertAIPermission({ input }: { input: UpsertAIPermissionInput }, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    if (input.organizationId) await requireOrganizationManagerRole(context, input.organizationId);
    const rows = await PermissionEntity.find({
      scope: input.scope,
      module: input.module,
      user_id: input.userId || null,
      organization_id: input.organizationId || null,
    }).many();
    const patch = {
      can_create: input.canCreate === true,
      can_read: input.canRead === true,
      can_update: input.canUpdate === true,
      can_delete: input.canDelete === true,
      can_execute: input.canExecute === true,
    };
    const row = (await (rows[0]
      ? rows[0].update(patch)
      : PermissionEntity.grant({
          scope: input.scope,
          module: input.module,
          user_id: input.userId || null,
          organization_id: input.organizationId || null,
          ...patch,
        }))) as PermissionEntity;
    invalidateSettingsGraphqlCache(row.organization_id);
    return formatAIPermission(row);
  }

  @resolver('deleteAIPermission', GraphQLOperationType.MUTATION)
  async deleteAIPermission({ input }: { input: DeleteAIPermissionInput }, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    if (input.organizationId) await requireOrganizationManagerRole(context, input.organizationId);
    const rows = await PermissionEntity.find({
      scope: input.scope,
      module: input.module,
      user_id: input.userId || null,
      organization_id: input.organizationId || null,
    }).many();
    for (const row of rows) await row.delete();
    const result = { deleted: rows.length };
    invalidateSettingsGraphqlCache(input.organizationId || null);

    return {
      message: result.deleted ? `AI permission ${input.module} deleted successfully` : `No AI permission found for module ${input.module}`,
    };
  }

  @resolver('addOrganizationNodeRestriction', GraphQLOperationType.MUTATION)
  async addOrganizationNodeRestriction({ input }: { input: OrganizationNodeRestrictionInput }, context: GraphqlResolverContext) {
    const { userId } = await getResolverAuthContext(context);
    if (input.organizationId) await requireOrganizationManagerRole(context, input.organizationId);
    const row = await addOrganizationNodeRestrictionData(input, userId);
    invalidateSettingsGraphqlCache(row.organizationId);
    return row;
  }

  @resolver('removeOrganizationNodeRestriction', GraphQLOperationType.MUTATION)
  async removeOrganizationNodeRestriction({ input }: { input: OrganizationNodeRestrictionDeleteInput }, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    if (input.organizationId) await requireOrganizationManagerRole(context, input.organizationId);
    const result = await removeOrganizationNodeRestrictionData(input);
    if (result.deleted) invalidateSettingsGraphqlCache(result.organizationId);
    return { message: result.message };
  }

  @resolver('addOrganizationContentRestriction', GraphQLOperationType.MUTATION)
  async addOrganizationContentRestriction({ input }: { input: OrganizationContentRestrictionInput }, context: GraphqlResolverContext) {
    const { userId } = await getResolverAuthContext(context);
    if (input.organizationId) await requireOrganizationManagerRole(context, input.organizationId);
    const row = await addOrganizationContentRestrictionData(input, userId);
    invalidateSettingsGraphqlCache(row.organizationId);
    return row;
  }

  @resolver('removeOrganizationContentRestriction', GraphQLOperationType.MUTATION)
  async removeOrganizationContentRestriction({ input }: { input: OrganizationContentRestrictionDeleteInput }, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    if (input.organizationId) await requireOrganizationManagerRole(context, input.organizationId);
    const result = await removeOrganizationContentRestrictionData(input);
    if (result.deleted) invalidateSettingsGraphqlCache(result.organizationId);
    return { message: result.message };
  }

  @resolver('users', GraphQLOperationType.QUERY)
  async users({ input }: UsersArgs = {}, context: GraphqlResolverContext) {
    const { effectiveRoot } = await getResolverAuthContext(context);
    if (!effectiveRoot) throw new BadRequestError('Only root users can list users.');
    return readUsersData(input || {});
  }

  @resolver('userById', GraphQLOperationType.QUERY)
  async userById({ id }: UserByIdArgs, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    const row = await readUserByIdData(id);
    if (!row?.id) return null;
    await assertCanReadUserRecord({ actorUserId: userId, targetUserId: String(row.id), effectiveRoot });
    return row;
  }

  @resolver('userByUsername', GraphQLOperationType.QUERY)
  async userByUsername({ username }: UserByUsernameArgs, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    const row = await readUserByUsernameData(username);
    if (!row?.id) return null;
    await assertCanReadUserRecord({ actorUserId: userId, targetUserId: String(row.id), effectiveRoot });
    return row;
  }

  @resolver('userByEmail', GraphQLOperationType.QUERY)
  async userByEmail({ email }: UserByEmailArgs, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    const row = await readUserByEmailData(email);
    if (!row?.id) return null;
    await assertCanReadUserRecord({ actorUserId: userId, targetUserId: String(row.id), effectiveRoot });
    return row;
  }

  @resolver('deleteUser', GraphQLOperationType.MUTATION)
  async deleteUser({ id }: DeleteUserArgs, _context: GraphqlResolverContext) {
    return deleteUserData(id, _context);
  }
}
