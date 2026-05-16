import { BadRequestError } from 'routing-controllers';
import { ORGANIZATION_MODULES } from '@giga/shared/types/contracts/org.types';
import { ENTITY, FIELD, RELATION, PERMISSIONS, Entity, Relation, GigaORM } from '@connectingmatrix/orm/orm';
import { AppRootUserEntity } from '../auth/AppRootUserEntity';
import { PermissionEntity } from '../auth/PermissionEntity';
import { SubscriptionEntity } from './SubscriptionEntity';
import { OrganizationContentRestrictionEntity } from './OrganizationContentRestrictionEntity';
import { OrganizationMemberEntity } from './OrganizationMemberEntity';
import { OrganizationNodeRestrictionEntity } from './OrganizationNodeRestrictionEntity';
import { SharedSpaceEntity } from './SharedSpaceEntity';
import type { ChannelEntity } from '../tree/Channel';
import type { ChatEntity } from './ChatEntity';
import type { CredentialEntity } from './CredentialEntity';
import type { NodeEntity } from './NodeEntity';
import type { UserEntity } from './UserEntity';
import type { WorkflowEntity } from './WorkflowEntity';
import type { GraphqlResolverContext } from '@giga/shared/types/contracts/graphql.types';
import type { OrganizationAccessContext, OrganizationAction, OrganizationModule } from '@giga/shared/types/contracts/org.types';

export type OrganisationRow = {
  id: string;
  slug?: string | null;
  name: string;
  description?: string | null;
  isActive?: boolean | null;
  billingStatus?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

type PaginationInput = { first?: number | null; offset?: number | null };
type PageResult<T> = { records: T[]; hasNextPage: boolean; returnedCount: number; totalCount?: number };

const pageBounds = (input?: PaginationInput) => {
  const first = Math.max(0, Math.floor(Number(input?.first ?? 50)));
  const offset = Math.max(0, Math.floor(Number(input?.offset ?? 0)));
  return { first, offset };
};

@ENTITY({ table: 'organizations', label: 'Organisation', store: 'dual', primaryKey: 'id', graph: { mirror: true } })
@PERMISSIONS({
  read: 'ORGANISATION_READ',
  list: 'ORGANISATION_LIST',
  create: 'ORGANISATION_CREATE',
  update: 'ORGANISATION_UPDATE',
  delete: 'ORGANISATION_DELETE',
  relations: {
    members: { list: 'ORGANISATION_MEMBER_LIST', create: 'ORGANISATION_MEMBER_CREATE' },
    channels: { list: 'CHANNEL_LIST', create: 'CHANNEL_CREATE', attach: 'CHANNEL_ATTACH', detach: 'CHANNEL_DETACH' },
    globalChannels: { list: 'GLOBAL_CHANNEL_LIST', create: 'GLOBAL_CHANNEL_CREATE' },
    workflows: { list: 'WORKFLOW_LIST', create: 'WORKFLOW_CREATE' },
    nodes: { list: 'NODE_LIST', create: 'NODE_CREATE' },
    credentials: { list: 'CREDENTIAL_LIST', create: 'CREDENTIAL_CREATE' },
    chats: { list: 'CHAT_LIST', create: 'CHAT_CREATE' },
  },
})
export class OrganisationEntity extends Entity<OrganisationRow> {
  @FIELD({ type: 'string', required: true, index: true }) public declare id: string | null;

  @FIELD({ type: 'string', index: true, unique: true }) public declare slug: string | null;

  @FIELD({ type: 'string', required: true, index: true }) public declare name: string | null;

  @FIELD({ type: 'string' }) public declare description: string | null;

  @FIELD({ type: 'boolean', required: true, default: true, column: 'is_active' }) public declare isActive: boolean | null;

  @FIELD({ type: 'string', required: true, default: 'UNPAID', column: 'billing_status' }) public declare billingStatus: string | null;

  @FIELD({ type: 'string', index: true, column: 'created_by' }) public declare createdBy: string | null;

  @FIELD({ type: 'string', column: 'created_at' }) public declare createdAt: string | null;

  @FIELD({ type: 'string', column: 'updated_at' }) public declare updatedAt: string | null;

  @FIELD({ type: 'object', default: {} }) public declare metadata: Record<string, unknown> | null;

  @RELATION({
    target: 'OrganizationMember',
    relation: 'HAS_MEMBER',
    store: 'supabase',
    many: true,
    owner: { scope: 'organization', parentField: 'id', childField: 'organization_id' },
  })
  public declare members: Relation<OrganizationMemberEntity>;

  @RELATION({
    target: 'User',
    relation: 'HAS_ORGANISATION_USER',
    store: 'supabase',
    many: true,
    owner: { join: { table: 'organization_members', sourceField: 'organization_id', targetField: 'user_id' } },
  })
  public declare users: Relation<UserEntity>;

  @RELATION({
    target: 'Channel',
    relation: 'OWNS',
    store: 'dual',
    many: true,
    owner: {
      scope: 'organization',
      parentField: 'id',
      childField: 'organizationId',
      actorField: 'createdBy',
      defaults: { isGlobal: false },
      unique: ['organizationId', 'isGlobal', 'slug'],
    },
    graph: { edge: true },
  })
  public declare channels: Relation<ChannelEntity>;

  @RELATION({
    target: 'Channel',
    relation: 'PUBLISHES_GLOBAL_CHANNEL',
    store: 'dual',
    many: true,
    owner: {
      scope: 'organization-global',
      parentField: 'id',
      childField: 'organizationId',
      actorField: 'createdBy',
      defaults: { isGlobal: true },
      unique: ['organizationId', 'isGlobal', 'slug'],
    },
    graph: { edge: true },
  })
  public declare globalChannels: Relation<ChannelEntity>;

  @RELATION({
    target: 'Workflow',
    relation: 'HAS_WORKFLOW',
    store: 'dual',
    many: true,
    owner: {
      scope: 'organization',
      parentField: 'id',
      childField: 'organization_id',
      defaults: { is_global: false },
      unique: ['organization_id', 'name'],
    },
    graph: { edge: true },
  })
  public declare workflows: Relation<WorkflowEntity>;

  @RELATION({
    target: 'Permission',
    relation: 'HAS_PERMISSION',
    store: 'supabase',
    many: true,
    owner: { scope: 'organization', parentField: 'id', childField: 'organization_id' },
  })
  public declare permissions: Relation<PermissionEntity>;

  @RELATION({
    target: 'Node',
    relation: 'HAS_NODE',
    store: 'dual',
    many: true,
    owner: { scope: 'organization', parentField: 'id', childField: 'organization_id', defaults: { scope_type: 'organization' } },
    graph: { edge: true },
  })
  public declare nodes: Relation<NodeEntity>;

  @RELATION({
    target: 'Credential',
    relation: 'HAS_CREDENTIAL',
    store: 'supabase',
    many: true,
    owner: { scope: 'organization', parentField: 'id', childField: 'organizationId', defaults: { scope: 'organization', isGlobal: false } },
  })
  public declare credentials: Relation<CredentialEntity>;

  @RELATION({
    target: 'Chat',
    relation: 'HAS_CHAT',
    store: 'supabase',
    many: true,
    owner: { scope: 'organization', parentField: 'id', childField: 'scope_id', defaults: { scope_type: 'organization' } },
  })
  public declare chats: Relation<ChatEntity>;

  @RELATION({
    target: 'OrganizationContentRestriction',
    relation: 'HAS_CONTENT_RESTRICTION',
    store: 'supabase',
    many: true,
    owner: { scope: 'organization', parentField: 'id', childField: 'organization_id' },
  })
  public declare contentRestrictions: Relation<OrganizationContentRestrictionEntity>;

  @RELATION({
    target: 'OrganizationNodeRestriction',
    relation: 'HAS_NODE_RESTRICTION',
    store: 'supabase',
    many: true,
    owner: { scope: 'organization', parentField: 'id', childField: 'organization_id' },
  })
  public declare nodeRestrictions: Relation<OrganizationNodeRestrictionEntity>;

  public get sharedSpace() {
    return SharedSpaceEntity.forOrganisation(this.getId());
  }

  public static supportedPermissionModules(): readonly OrganizationModule[] {
    return ORGANIZATION_MODULES;
  }

  public static isSupportedPermissionModule(value: string): value is OrganizationModule {
    const module = String(value || '')
      .trim()
      .toUpperCase() as OrganizationModule;
    return this.supportedPermissionModules().includes(module);
  }

  public static async accessContext(input: {
    supabase: unknown;
    userId: string;
    organizationId?: string | null;
    context?: GraphqlResolverContext;
  }): Promise<OrganizationAccessContext> {
    const organizationAccess = await import('@giga/general/services/organization/access');
    return organizationAccess.getOrganizationAccessContext(input.supabase, input.userId, input.organizationId || null, input.context);
  }

  public static canAccess(access: OrganizationAccessContext, input: { module: OrganizationModule; action: OrganizationAction }): boolean {
    if (access.bypassPermissions) return true;
    const summary = access.modulePermissions[input.module] || {
      allowCreate: true,
      allowRead: true,
      allowUpdate: true,
      allowDelete: true,
      allowExecute: true,
    };
    if (input.action === 'create') return summary.allowCreate;
    if (input.action === 'read') return summary.allowRead;
    if (input.action === 'update') return summary.allowUpdate;
    if (input.action === 'delete') return summary.allowDelete;
    return summary.allowExecute;
  }

  public static requirePermission(
    access: OrganizationAccessContext,
    input: {
      module: OrganizationModule;
      action: OrganizationAction;
      targetType?: 'CHANNEL' | 'CATEGORY' | 'SUBJECT' | 'POST' | null;
      targetId?: string | null;
    },
  ): void {
    if (!this.canAccess(access, { module: input.module, action: input.action })) {
      throw new BadRequestError(`Insufficient permissions for ${input.module} ${input.action}.`);
    }
    this.assertFeatureAllowed(access, { targetType: input.targetType || null, targetId: input.targetId || null });
  }

  public static assertFeatureAllowed(
    access: OrganizationAccessContext,
    input: { targetType?: 'CHANNEL' | 'CATEGORY' | 'SUBJECT' | 'POST' | null; targetId?: string | null },
  ): void {
    if (access.bypassPermissions) return;
    const targetId = String(input.targetId || '').trim();
    if (!targetId) return;
    if (input.targetType === 'CHANNEL' && access.deniedChannelIds.has(targetId)) throw new BadRequestError('Access denied for this channel.');
    if (input.targetType === 'CATEGORY' && access.deniedCategoryIds.has(targetId)) throw new BadRequestError('Access denied for this category.');
    if (input.targetType === 'SUBJECT' && access.deniedSubjectIds.has(targetId)) throw new BadRequestError('Access denied for this subject.');
    if (input.targetType === 'POST' && access.deniedPostIds.has(targetId)) throw new BadRequestError('Access denied for this post.');
  }

  public static isNodeRestricted(access: OrganizationAccessContext, nodeId: string): boolean {
    return access.deniedNodeIds.has(String(nodeId || '').trim());
  }

  public static async activeIdsForUser(userId: string): Promise<string[]> {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) return [];
    return GigaORM.run({ caller: { id: 'organization-access', type: 'root' } }, async () => {
      const memberships = await OrganizationMemberEntity.find({ user_id: normalizedUserId, is_disabled: false }).select('organization_id').many();
      const ids = memberships.map((membership) => String(membership.organization_id || '').trim()).filter(Boolean);
      if (!ids.length) return [];
      const organizations = await this.find({ isActive: true }).whereIn('id', ids).select('id').many();
      return organizations.map((organization) => String(organization.id || '').trim()).filter(Boolean);
    });
  }

  public static async ownedIdsForUser(userId: string, activeOrganizationIds: string[] = []): Promise<string[]> {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) return [];
    return GigaORM.run({ caller: { id: 'organization-owner', type: 'root' } }, async () => {
      const memberships = await OrganizationMemberEntity.find({ user_id: normalizedUserId, is_disabled: false })
        .select('organization_id,role')
        .many();
      const superAdminIds = memberships
        .filter((membership) => {
          const role = String(membership.role || '').toUpperCase();
          return role === 'SUPER_ADMIN' || role === 'OWNER';
        })
        .map((membership) => String(membership.organization_id || '').trim())
        .filter(Boolean);
      const scopedIds = activeOrganizationIds.length ? superAdminIds.filter((id) => activeOrganizationIds.includes(id)) : superAdminIds;
      if (!scopedIds.length) return [];
      const organizations = await this.find({ createdBy: normalizedUserId, isActive: true }).whereIn('id', scopedIds).select('id').many();
      return organizations.map((organization) => String(organization.id || '').trim()).filter(Boolean);
    });
  }

  public static async isActive(organizationId: string): Promise<boolean> {
    const organization = await this.find({ id: String(organizationId || '').trim(), isActive: true })
      .select('id')
      .single();
    return Boolean(organization?.id);
  }

  public static async accessForUser(input: {
    userId: string;
    organizationId?: string | null;
    effectiveRoot?: boolean | null;
  }): Promise<{ organizationIds: string[]; selectedOrganizationId: string | null; effectiveRoot: boolean }> {
    const userId = String(input.userId || '').trim();
    const selectedOrganizationId = String(input.organizationId || '').trim() || null;
    const effectiveRoot = input.effectiveRoot === true || (await AppRootUserEntity.isRootUserId(userId));
    if (effectiveRoot) {
      const organizations = selectedOrganizationId
        ? await this.find({ id: selectedOrganizationId }).select('id').many()
        : await this.find({ isActive: true }).select('id').many();
      return {
        organizationIds: organizations.map((organization) => String(organization.id || '')).filter(Boolean),
        selectedOrganizationId,
        effectiveRoot: true,
      };
    }
    const organizationIds = await this.activeIdsForUser(userId);
    return {
      organizationIds: selectedOrganizationId ? organizationIds.filter((id) => id === selectedOrganizationId) : organizationIds,
      selectedOrganizationId,
      effectiveRoot: false,
    };
  }

  public static async listForUser(input: {
    userId: string;
    id?: string | null;
    slug?: string | null;
    isActive?: boolean | null;
  }): Promise<OrganisationEntity[]> {
    const access = await this.accessForUser({ userId: input.userId });
    let query = this.find();
    if (input.id) query = query.where({ id: input.id });
    if (input.slug) query = query.where({ slug: input.slug });
    if (input.isActive === true) query = query.where({ isActive: true });
    if (input.isActive === false) query = query.where({ isActive: false });
    if (!access.effectiveRoot) {
      if (!access.organizationIds.length) return [];
      query = query.whereIn('id', access.organizationIds);
    }
    return query.orderBy('updatedAt', 'desc').many();
  }

  public static async readScopeAccessRows(userId: string, organizationId: string) {
    const organization = await this.single(organizationId);
    const membership = await OrganizationMemberEntity.find({
      organization_id: organizationId,
      user_id: userId,
      is_disabled: false,
    }).single();
    const restrictions = await OrganizationContentRestrictionEntity.find({ organization_id: organizationId, user_id: userId }).many();
    return {
      organization: organization ? (organization.payload as Record<string, unknown>) : null,
      membership: membership ? (membership.payload as Record<string, unknown>) : null,
      restrictions: restrictions.map((row) => row.payload as Record<string, unknown>),
    };
  }

  public static async requireAccess(input: { userId: string; organizationId: string; effectiveRoot?: boolean | null }): Promise<void> {
    const access = await this.accessForUser(input);
    if (access.effectiveRoot) return;
    if (!access.organizationIds.includes(input.organizationId)) {
      throw new Error(`User ${input.userId} does not have access to organization ${input.organizationId}.`);
    }
  }

  public static async readMembersData(organizationId: string): Promise<OrganizationMemberEntity[]> {
    return OrganizationMemberEntity.find({ organization_id: organizationId }).orderBy('created_at', 'desc').many();
  }

  public static async readNodeRestrictionsData(input: {
    organizationId?: string | null;
    userId?: string | null;
  }): Promise<OrganizationNodeRestrictionEntity[]> {
    let query = OrganizationNodeRestrictionEntity.find();
    if (input.organizationId) query = query.where({ organization_id: input.organizationId });
    if (input.userId) query = query.where({ user_id: input.userId });
    return query.orderBy('created_at', 'desc').many();
  }

  public static async readContentRestrictionsData(input: {
    organizationId?: string | null;
    userId?: string | null;
  }): Promise<OrganizationContentRestrictionEntity[]> {
    let query = OrganizationContentRestrictionEntity.find();
    if (input.organizationId) query = query.where({ organization_id: input.organizationId });
    if (input.userId) query = query.where({ user_id: input.userId });
    return query.orderBy('created_at', 'desc').many();
  }

  public static async createOrganizationData(input: {
    name: string;
    slug?: string | null;
    description?: string | null;
    createdBy: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<OrganisationEntity> {
    const organization = await this.create({
      name: input.name,
      slug: input.slug ?? null,
      description: input.description ?? null,
      createdBy: input.createdBy,
      isActive: true,
      billingStatus: 'UNPAID',
      metadata: input.metadata ?? {},
    });
    await organization.members.create({ user_id: input.createdBy, role: 'SUPER_ADMIN', is_disabled: false });
    return organization;
  }

  public static async updateOrganizationData(input: {
    id: string;
    name?: string | null;
    slug?: string | null;
    description?: string | null;
    isActive?: boolean | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<OrganisationEntity> {
    const organization = await this.single(input.id);
    if (!organization) throw new Error(`Organization ${input.id} was not found.`);
    return organization.update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata ?? {} } : {}),
    });
  }

  public static async deleteOrganizationData(organizationId: string): Promise<void> {
    const organization = await this.single(organizationId);
    if (!organization) return;
    await organization.update({ isActive: false });
  }

  public static async listActiveRowsByIds(ids: string[]): Promise<OrganisationEntity[]> {
    return ids.length ? this.find({ isActive: true }).whereIn('id', ids).many() : [];
  }

  public static async readCreatedByById(id: string): Promise<{ createdBy: string | null } | null> {
    const row = await this.find({ id }).select('createdBy').single();
    return row ? { createdBy: row.createdBy ?? null } : null;
  }

  public static async findById(id: string): Promise<OrganisationEntity | null> {
    return id ? this.single(id) : null;
  }

  public static async listOwnedRowsByCreatorId(userId: string): Promise<OrganisationEntity[]> {
    return userId ? this.find({ createdBy: userId }).many() : [];
  }

  public static async findByFilter(input?: PaginationInput): Promise<PageResult<OrganisationEntity>> {
    const { first, offset } = pageBounds(input);
    const result = await this.find().orderBy('updatedAt', 'desc').limit(first).offset(offset).manyWithCount();
    return {
      records: result.records,
      hasNextPage: offset + result.records.length < result.count,
      returnedCount: result.records.length,
      totalCount: result.count,
    };
  }

  public static async updateById(id: string, patch: Partial<OrganisationRow>): Promise<OrganisationEntity | null> {
    const row = await this.single(id);
    return row ? row.update(patch) : null;
  }

  public static async deleteById(id: string): Promise<void> {
    const row = await this.single(id);
    if (row) await row.delete();
  }

  public static async readRestrictionRows(input: {
    table: string;
    orgIds: string[];
    fieldSelect: string;
    userId?: string | null;
  }): Promise<Record<string, unknown>[]> {
    if (input.table === 'organization_content_restrictions') {
      const rows = input.userId
        ? await OrganizationContentRestrictionEntity.find().whereIn('organization_id', input.orgIds).where({ user_id: input.userId }).many()
        : await OrganizationContentRestrictionEntity.find().whereIn('organization_id', input.orgIds).many();
      return rows.map((row) => row.payload as Record<string, unknown>);
    }
    if (input.table === 'organization_node_restrictions') {
      const rows = input.userId
        ? await OrganizationNodeRestrictionEntity.find().whereIn('organization_id', input.orgIds).where({ user_id: input.userId }).many()
        : await OrganizationNodeRestrictionEntity.find().whereIn('organization_id', input.orgIds).many();
      return rows.map((row) => row.payload as Record<string, unknown>);
    }
    return [];
  }

  public async billingAccessState(): Promise<{ organizationId: string; billingStatus: string | null; hasActiveSubscription: boolean }> {
    const organizationId = String(this.id || '').trim();
    if (!organizationId) throw new Error('Organization id is required for billing access state.');
    const subscriptions = await SubscriptionEntity.forOrganization(organizationId);
    return {
      organizationId,
      billingStatus: this.billingStatus ?? null,
      hasActiveSubscription: subscriptions.some((subscription) => subscription.status === 'active'),
    };
  }
}
