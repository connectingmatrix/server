import { TreeGraphEntity } from '@giga/tree/services/giga/tree/runtime/system';
import { GRAPH_LABELS } from '@giga/shared/types/contracts/graph.types';
import { ENTITY, FIELD, RELATION, PERMISSIONS, Entity, Relation, GigaORM } from '@connectingmatrix/orm/orm';
import { AppRootUserEntity } from '../auth/AppRootUserEntity';
import { CategoryEntity } from '../tree/Category';
import { SubjectEntity } from '../tree/Subject';
import type { ChannelEntity } from '../tree/Channel';
import type { ChatEntity } from './ChatEntity';
import type { CredentialEntity } from './CredentialEntity';
import type { NodeEntity } from './NodeEntity';
import type { OrganisationEntity } from './OrganisationEntity';
import type { PermissionEntity } from '../auth/PermissionEntity';
import type { UserActivityLogEntity } from '../telemetry/UserActivityLogEntity';
import type { UserPreferenceEntity } from '../contracts/UserPreferenceEntity';
import type { WorkflowEntity } from './WorkflowEntity';

export type UserRow = {
  id: string;
  email: string;
  username: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  roleId?: string | null;
  stripeCustomerId?: string | null;
  avatar?: string | null;
  blockedIds?: string[] | null;
  blockerIds?: string[] | null;
  isVerified?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type UserProfile = UserRow;

type PaginationInput = { first?: number | null; offset?: number | null; isDisabled?: boolean | null };
type PageResult<T> = { records: T[]; hasNextPage: boolean; returnedCount: number; totalCount?: number };

const pageBounds = (input?: PaginationInput) => {
  const first = Math.max(0, Math.floor(Number(input?.first ?? 50)));
  const offset = Math.max(0, Math.floor(Number(input?.offset ?? 0)));
  return { first, offset };
};

@ENTITY({
  table: 'User',
  label: 'User',
  store: 'dual',
  primaryKey: 'id',
  defaultRef: ({ caller }) => caller.id,
  graph: { mirror: true, label: 'UserPermissions' },
})
@PERMISSIONS({
  read: 'USER_READ',
  list: 'USER_LIST',
  create: 'USER_CREATE',
  update: 'USER_UPDATE',
  delete: 'USER_DELETE',
  relations: {
    channels: { list: 'CHANNEL_LIST', create: 'CHANNEL_CREATE', attach: 'CHANNEL_ATTACH', detach: 'CHANNEL_DETACH' },
    workflows: { list: 'WORKFLOW_LIST', create: 'WORKFLOW_CREATE' },
    permissions: { list: 'PERMISSION_LIST', create: 'PERMISSION_CREATE' },
    nodes: { list: 'NODE_LIST', create: 'NODE_CREATE' },
    credentials: { list: 'CREDENTIAL_LIST', create: 'CREDENTIAL_CREATE' },
    organisations: { list: 'ORGANISATION_LIST', attach: 'ORGANISATION_ATTACH', detach: 'ORGANISATION_DETACH' },
    chats: { list: 'CHAT_LIST', create: 'CHAT_CREATE' },
  },
})
export class UserEntity extends Entity<UserRow> {
  @FIELD({ type: 'string', required: true, index: true }) public declare id: string | null;

  @FIELD({ type: 'string', required: true, index: true, unique: true }) public declare email: string | null;

  @FIELD({ type: 'string', required: true, index: true, unique: true }) public declare username: string | null;

  @FIELD({ type: 'string' }) public declare name: string | null;

  @FIELD({ type: 'string' }) public declare firstName: string | null;

  @FIELD({ type: 'string' }) public declare lastName: string | null;

  @FIELD({ type: 'string' }) public declare phone: string | null;

  @FIELD({ type: 'string' }) public declare address: string | null;

  @FIELD({ type: 'string' }) public declare city: string | null;

  @FIELD({ type: 'string' }) public declare state: string | null;

  @FIELD({ type: 'string' }) public declare country: string | null;

  @FIELD({ type: 'string' }) public declare postalCode: string | null;

  @FIELD({ type: 'string' }) public declare roleId: string | null;

  @FIELD({ type: 'string' }) public declare stripeCustomerId: string | null;

  @FIELD({ type: 'string' }) public declare avatar: string | null;

  @FIELD({ type: 'array' }) public declare blockedIds: string[] | null;

  @FIELD({ type: 'array' }) public declare blockerIds: string[] | null;

  @FIELD({ type: 'boolean' }) public declare isVerified: boolean | null;

  @FIELD({ type: 'string' }) public declare createdAt: string | null;

  @FIELD({ type: 'string' }) public declare updatedAt: string | null;

  @RELATION({
    target: 'Channel',
    relation: 'OWNS',
    store: 'dual',
    many: true,
    owner: { scope: 'user', parentField: 'id', childField: 'createdBy', clear: ['organizationId', 'isGlobal'], unique: ['createdBy', 'slug'] },
    graph: { edge: true, sourceLabel: 'UserPermissions' },
  })
  public declare channels: Relation<ChannelEntity>;

  @RELATION({
    target: 'Workflow',
    relation: 'HAS_WORKFLOW',
    store: 'dual',
    many: true,
    owner: { scope: 'user', parentField: 'id', childField: 'user_id', clear: ['organization_id', 'is_global'], unique: ['user_id', 'name'] },
    graph: { edge: true, sourceLabel: 'UserPermissions' },
  })
  public declare workflows: Relation<WorkflowEntity>;

  @RELATION({
    target: 'Permission',
    relation: 'HAS_PERMISSION',
    store: 'supabase',
    many: true,
    owner: { scope: 'user', parentField: 'id', childField: 'user_id' },
  })
  public declare permissions: Relation<PermissionEntity>;

  @RELATION({
    target: 'Node',
    relation: 'HAS_NODE',
    store: 'dual',
    many: true,
    owner: { scope: 'user', parentField: 'id', childField: 'scope_id', defaults: { scope_type: 'user' } },
    graph: { edge: true, sourceLabel: 'UserPermissions' },
  })
  public declare nodes: Relation<NodeEntity>;

  @RELATION({
    target: 'Credential',
    relation: 'HAS_CREDENTIAL',
    store: 'supabase',
    many: true,
    owner: { scope: 'user', parentField: 'id', childField: 'userId', defaults: { scope: 'user', isGlobal: false }, clear: ['organizationId'] },
  })
  public declare credentials: Relation<CredentialEntity>;

  @RELATION({
    target: 'Organisation',
    relation: 'HAS_ORGANISATION',
    store: 'dual',
    many: true,
    owner: { join: { table: 'organization_members', sourceField: 'user_id', targetField: 'organization_id' } },
    graph: { edge: true, sourceLabel: 'UserPermissions' },
  })
  public declare organisations: Relation<OrganisationEntity>;

  @RELATION({
    target: 'Chat',
    relation: 'HAS_CHAT',
    store: 'supabase',
    many: true,
    owner: { scope: 'user', parentField: 'id', childField: 'user_id', defaults: { scope_type: 'user' } },
  })
  public declare chats: Relation<ChatEntity>;

  @RELATION({
    target: 'UserPreference',
    relation: 'HAS_PREFERENCE',
    store: 'supabase',
    many: true,
    owner: { scope: 'user', parentField: 'id', childField: 'createdBy' },
  })
  public declare preferences: Relation<UserPreferenceEntity>;

  @RELATION({
    target: 'UserActivityLog',
    relation: 'HAS_ACTIVITY_LOG',
    store: 'supabase',
    many: true,
    owner: { scope: 'user', parentField: 'id', childField: 'user_id' },
  })
  public declare activityLogs: Relation<UserActivityLogEntity>;

  public static async byId(id: string): Promise<UserEntity | null> {
    const normalizedId = String(id || '').trim();
    return normalizedId ? this.single(normalizedId) : null;
  }

  public static async byEmail(email: string): Promise<UserEntity | null> {
    const normalizedEmail = String(email || '')
      .trim()
      .toLowerCase();
    return normalizedEmail ? this.find({ email: normalizedEmail }).single() : null;
  }

  public static async byUsername(username: string): Promise<UserEntity | null> {
    const normalizedUsername = String(username || '').trim();
    return normalizedUsername ? this.find({ username: normalizedUsername }).single() : null;
  }

  public static async manyByEmail(emails: readonly string[]): Promise<UserEntity[]> {
    const normalizedEmails = Array.from(
      new Set(
        emails
          .map((email) =>
            String(email || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    );
    return normalizedEmails.length ? this.find().whereIn('email', normalizedEmails).many() : [];
  }

  public static async idEmailById(id: string): Promise<{ id: string; email: string | null } | null> {
    const user = await this.find({ id }).select('id,email').single();
    return user ? { id: String(user.id), email: user.email ?? null } : null;
  }

  public static async idEmailByEmail(email: string): Promise<{ id: string; email: string | null } | null> {
    const user = await this.find({
      email: String(email || '')
        .trim()
        .toLowerCase(),
    })
      .select('id,email')
      .single();
    return user ? { id: String(user.id), email: user.email ?? null } : null;
  }

  public static async profile(id: string): Promise<Pick<UserEntity, 'id' | 'email' | 'firstName' | 'lastName' | 'username'> | null> {
    const user = await this.find({ id }).select('id,email,firstName,lastName,username').single();
    return user ? { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, username: user.username } : null;
  }

  public static async list(input?: PaginationInput): Promise<PageResult<UserEntity>> {
    const { first, offset } = pageBounds(input);
    const query = this.find();
    const result = await query.orderBy('id', 'desc').limit(first).offset(offset).manyWithCount();
    return {
      records: result.records,
      hasNextPage: offset + result.records.length < result.count,
      returnedCount: result.records.length,
      totalCount: result.count,
    };
  }

  public static async categoriesByUserId(userId: string): Promise<CategoryEntity[]> {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) return [];
    return GigaORM.run({ caller: { id: 'user-owned-categories', type: 'root' } }, () =>
      CategoryEntity.find({ createdBy: normalizedUserId }).orderBy('updatedAt', 'desc').many(),
    );
  }

  public static async subjectsByUserId(userId: string): Promise<SubjectEntity[]> {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) return [];
    return GigaORM.run({ caller: { id: 'user-owned-subjects', type: 'root' } }, async () => {
      const rows = await (
        await TreeGraphEntity.getNeo()
      ).run<{ id: string; createdBy: string }>(
        `MATCH (subject:${GRAPH_LABELS.subjectRef}) WHERE subject.createdBy = $userId RETURN subject.id AS id, subject.createdBy AS createdBy`,
        {
          userId: normalizedUserId,
        },
      );
      const createdByById = new Map(rows.map((row) => [String(row.id || '').trim(), String(row.createdBy || '').trim()]));
      const subjectIds = Array.from(createdByById.keys()).filter(Boolean);
      if (!subjectIds.length) return [];
      const subjects = await SubjectEntity.find().whereIn('id', subjectIds).many();
      for (const subject of subjects) {
        const subjectId = String(subject.id || '').trim();
        subject.createdBy = createdByById.get(subjectId) || normalizedUserId;
      }
      return subjects;
    });
  }

  public static async deleteById(id: string): Promise<void> {
    const user = await this.single(id);
    if (user) await user.delete();
  }

  public static currentId(): string {
    const callerId = String(this.load().caller?.id || '').trim();
    if (!callerId) throw new Error('Caller context is missing user id.');
    return callerId;
  }

  public static async rootIdentityData(input?: { includeInactive?: boolean }) {
    const query = input?.includeInactive ? AppRootUserEntity.find() : AppRootUserEntity.find({ is_active: true });
    return query.orderBy('created_at', 'desc').many();
  }

  public static async memberCandidates(input: { organizationId: string; email: string }): Promise<UserEntity[]> {
    const email = String(input.email || '')
      .trim()
      .toLowerCase();
    if (!email) return [];
    return this.find().whereIlike('email', `%${email}%`).orderBy('email', 'asc').limit(20).many();
  }

  public static async resolvePlusTestLoginUser(email: string): Promise<UserEntity | null> {
    return this.byEmail(email);
  }

  public static async findById(id: string): Promise<UserEntity | null> {
    return this.byId(id);
  }

  public static async findByIdMaybe(id: string): Promise<UserEntity | null> {
    return this.byId(id);
  }

  public static async findByEmail(email: string): Promise<UserEntity | null> {
    return this.byEmail(email);
  }

  public static async findByUsername(username: string): Promise<UserEntity | null> {
    return this.byUsername(username);
  }

  public static async findIdEmailById(id: string): Promise<{ id: string; email: string | null } | null> {
    return this.idEmailById(id);
  }

  public static async findIdEmailByEmail(email: string): Promise<{ id: string; email: string | null } | null> {
    return this.idEmailByEmail(email);
  }

  public static async findByEmailInsensitive(email: string): Promise<UserEntity[]> {
    const normalizedEmail = String(email || '')
      .trim()
      .toLowerCase();
    return normalizedEmail ? this.find({ email: normalizedEmail }).many() : [];
  }

  public static async findByFilter(input?: PaginationInput): Promise<{ data: UserEntity[]; count: number }> {
    const result = await this.list(input);
    return { data: result.records, count: result.totalCount || 0 };
  }

  public static async updateById(id: string, patch: Partial<UserRow>): Promise<UserEntity | null> {
    const user = await this.single(id);
    return user ? user.update(patch) : null;
  }
}
