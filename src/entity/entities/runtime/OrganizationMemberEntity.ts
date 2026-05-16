import { ENTITY, FIELD, PERMISSIONS, Entity } from '@connectingmatrix/orm/orm';
import { OrganisationEntity } from './OrganisationEntity';

export type OrganizationMemberRow = {
  id?: string | null;
  organization_id: string;
  user_id: string;
  role?: string | null;
  is_disabled?: boolean | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

@ENTITY({ table: 'organization_members', label: 'OrganizationMember', store: 'supabase', primaryKey: 'id' })
@PERMISSIONS({
  read: 'ORGANIZATION_MEMBER_READ',
  list: 'ORGANIZATION_MEMBER_LIST',
  create: 'ORGANIZATION_MEMBER_CREATE',
  update: 'ORGANIZATION_MEMBER_UPDATE',
  delete: 'ORGANIZATION_MEMBER_DELETE',
})
export class OrganizationMemberEntity extends Entity<OrganizationMemberRow> {
  @FIELD({ type: 'string', required: true, index: true }) public declare id: string | null;

  @FIELD({ type: 'string', required: true, index: true }) public declare organization_id: string | null;

  @FIELD({ type: 'string', required: true, index: true }) public declare user_id: string | null;

  @FIELD({ type: 'string', default: 'MEMBER' }) public declare role: string | null;

  @FIELD({ type: 'boolean', default: false }) public declare is_disabled: boolean | null;

  @FIELD({ type: 'object', default: {} }) public declare metadata: Record<string, unknown> | null;

  @FIELD({ type: 'string' }) public declare created_at: string | null;

  @FIELD({ type: 'string' }) public declare updated_at: string | null;

  public static async ownedOrganizationIds(userId: string): Promise<string[]> {
    const memberships = await this.find({ user_id: userId, role: 'SUPER_ADMIN', is_disabled: false }).select('organization_id').many();
    return memberships.map((membership) => String(membership.organization_id || '').trim()).filter(Boolean);
  }

  public static async requireOwner(input: { userId: string; organizationId: string }): Promise<void> {
    const membership = await this.find({
      user_id: input.userId,
      organization_id: input.organizationId,
      role: 'SUPER_ADMIN',
      is_disabled: false,
    })
      .select('id')
      .single();
    if (!membership?.id) throw new Error(`User ${input.userId} is not an owner of organization ${input.organizationId}.`);
  }

  public static async transferOwner(input: { organizationId: string; fromUserId: string; toUserId: string }): Promise<void> {
    await this.requireOwner({ userId: input.fromUserId, organizationId: input.organizationId });
    const target = await this.find({ organization_id: input.organizationId, user_id: input.toUserId }).single();
    if (target) {
      await target.update({ role: 'SUPER_ADMIN', is_disabled: false });
      return;
    }
    await OrganisationEntity.load(input.organizationId).members.create({
      user_id: input.toUserId,
      role: 'SUPER_ADMIN',
      is_disabled: false,
    });
  }

  public static async listActiveRowsByUserId(userId: string): Promise<OrganizationMemberEntity[]> {
    return userId ? this.find({ user_id: userId, is_disabled: false }).many() : [];
  }

  public static async findByOrganizationId(organizationId: string): Promise<OrganizationMemberEntity[]> {
    return organizationId ? this.find({ organization_id: organizationId }).many() : [];
  }

  public static async updateById(id: string, patch: Partial<OrganizationMemberRow>): Promise<OrganizationMemberEntity | null> {
    const row = await this.single(id);
    return row ? row.update(patch) : null;
  }

  public static async deleteByOrganizationId(organizationId: string): Promise<number> {
    return this.deleteMany({ organization_id: organizationId });
  }

  public static async createOrUpdateByOrganizationAndUser(
    payload: Omit<OrganizationMemberRow, 'id'> & { id?: string | null },
  ): Promise<OrganizationMemberEntity> {
    const existing = await this.find({ organization_id: payload.organization_id, user_id: payload.user_id }).single();
    if (existing) return existing.update(payload);
    return this.create(payload as OrganizationMemberRow);
  }

  public static async listForOrganization(organizationId: string): Promise<OrganizationMemberEntity[]> {
    return this.find({ organization_id: organizationId }).orderBy('created_at', 'desc').many();
  }

  public static async findByOrganizationAndUser(input: { organizationId: string; userId: string }): Promise<OrganizationMemberEntity | null> {
    return this.find({ organization_id: input.organizationId, user_id: input.userId }).single();
  }

  public static async updateByOrganizationAndUser(input: {
    organizationId: string;
    userId: string;
    patch: Partial<OrganizationMemberRow>;
  }): Promise<OrganizationMemberEntity | null> {
    const row = await this.findByOrganizationAndUser({ organizationId: input.organizationId, userId: input.userId });
    return row ? row.update(input.patch) : null;
  }

  public static async deleteByOrganizationAndUser(input: { organizationId: string; userId: string }): Promise<void> {
    const row = await this.findByOrganizationAndUser(input);
    if (row) await row.delete();
  }

  public static async removeMember(input: { organizationId: string; userId: string }): Promise<void> {
    await this.deleteByOrganizationAndUser(input);
  }

  public static async disableMember(input: {
    organizationId: string;
    userId: string;
    disabledBy?: string | null;
  }): Promise<OrganizationMemberEntity | null> {
    return this.updateByOrganizationAndUser({
      organizationId: input.organizationId,
      userId: input.userId,
      patch: { is_disabled: true },
    });
  }

  public static async updateRole(input: { organizationId: string; userId: string; role: string }): Promise<OrganizationMemberEntity | null> {
    return this.updateByOrganizationAndUser({
      organizationId: input.organizationId,
      userId: input.userId,
      patch: { role: input.role, is_disabled: false },
    });
  }

  public static async demoteSuperAdminsExceptUser(input: { organizationId: string; userId: string }): Promise<void> {
    const rows = await this.find({ organization_id: input.organizationId, role: 'SUPER_ADMIN', is_disabled: false }).many();
    for (const row of rows) {
      if (String(row.user_id || '') === input.userId) continue;
      await row.update({ role: 'MEMBER' });
    }
  }

  public static async findByUserIdWithOrganization(userId: string): Promise<OrganizationMemberEntity[]> {
    return this.find({ user_id: userId }).many();
  }

  public static async countByOrganizationId(organizationId: string): Promise<number> {
    return this.find({ organization_id: organizationId, is_disabled: false }).count();
  }
}
