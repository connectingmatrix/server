import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { GigaORM } from '@connectingmatrix/orm/orm';
import { CategoryEntity, SubjectEntity } from '@connectingmatrix/orm/repositories/entities';
import { TreeGraphEntity } from '@giga/tree/services/giga/tree/runtime/system';
import { ensureEntityOrmInstalled } from '@connectingmatrix/orm/services/graphql/entity-request-context';
import { GRAPH_LABELS } from '@giga/shared/types/contracts/graph.types';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';
import { createUserSessionHeader, graphqlRequest, startLiveApi, stopLiveApi } from './activity-log-live.runtime.fixture';
import { INTROSPECTION_QUERY, buildQueryDocument, fieldSelection, parseSchemaIndex, type SchemaField } from './live-query-sweep.graphql';
import { valuesForArgs } from './live-query-sweep.values';
import type { ChildProcess } from 'node:child_process';

type RoleKey = 'root' | 'orgAdmin' | 'normal';
type RoleRuntime = {
  userId: string;
  email: string;
  username: string;
  token: string;
  organizationIds: string[];
  channelId: string;
  categoryId: string;
  subjectId: string;
};

const port = 3022 + Math.floor(Math.random() * 400);
const url = `http://localhost:${port}/api/v2/graphql`;
const admin = () => SupabaseClientAdmin();
const REQUEST_TIMEOUT_MS = 20_000;
const INTROSPECTION_TIMEOUT_MS = 120_000;
let server: ChildProcess | null = null;
const runtime = {} as Record<RoleKey, RoleRuntime>;

const USER_EMAILS: Record<RoleKey, string> = {
  root: 'abeersaqib@gmail.com',
  orgAdmin: 'rich@gigaintelligence.com',
  normal: 'rich+123@gigaintelligence.com',
};

const Q_ORGS = 'query Organizations($input: OrganizationsInput) { organizations(input: $input) { id slug isActive } }';
const Q_USERS = 'query Users($input: UsersInput) { users(input: $input) { count data { id email } } }';
const Q_BY_ID = 'query ById($id: UUID!) { userById(id: $id) { id email username } }';
const Q_BY_EMAIL = 'query ByEmail($email: String!) { userByEmail(email: $email) { id email username } }';
const Q_BY_USERNAME = 'query ByUsername($username: String!) { userByUsername(username: $username) { id email username } }';
const Q_USER_TREE =
  'query UserTree($id: UUID!) { userById(id: $id) { id organisations { id } categories { id createdBy } subjects { id createdBy } } }';

const text = (value: unknown) => String(value || '').trim();

async function resolveUser(email: string) {
  const user = await admin().from('User').select('id,email,username').eq('email', email).maybeSingle();
  if (user.error || !user.data?.id || !user.data?.email || !user.data?.username) throw new Error(`Could not resolve ${email}`);
  return { userId: String(user.data.id), email: String(user.data.email), username: String(user.data.username) };
}

async function readOrganizationIds(userId: string): Promise<string[]> {
  const memberships = await admin().from('organization_members').select('organization_id').eq('user_id', userId).eq('is_disabled', false);
  if (memberships.error) throw memberships.error;
  const ids = (memberships.data || []).map((row) => String(row.organization_id || '').trim()).filter(Boolean);
  if (!ids.length) return [];
  const activeOrganizations = await admin().from('organizations').select('id').in('id', ids).eq('is_active', true);
  if (activeOrganizations.error) throw activeOrganizations.error;
  return (activeOrganizations.data || []).map((row) => String(row.id || '').trim()).filter(Boolean);
}

async function seedOwnedRecords(role: RoleRuntime) {
  role.channelId = randomUUID();
  role.categoryId = randomUUID();
  role.subjectId = randomUUID();
  await GigaORM.run({ caller: { id: 'permissions-live-seed', type: 'root' } }, async () => {
    await CategoryEntity.create({
      id: role.categoryId,
      name: `perm-cat-${role.categoryId.slice(0, 8)}`,
      slug: `perm-cat-${role.categoryId.slice(0, 8)}`,
      createdBy: role.userId,
      organizationId: null,
      isGlobal: false,
    } as never);
    await SubjectEntity.create({
      id: role.subjectId,
      name: `perm-sub-${role.subjectId.slice(0, 8)}`,
      slug: `perm-sub-${role.subjectId.slice(0, 8)}`,
      metadata: {},
      summary: null,
    } as never);
    await (
      await TreeGraphEntity.getNeo()
    ).run(`MERGE (subject:${GRAPH_LABELS.subjectRef} {id: $id}) SET subject.supabaseId = $id, subject.createdBy = $userId`, {
      id: role.subjectId,
      userId: role.userId,
    });
  });
}

async function cleanupOwnedRecords(role: RoleRuntime) {
  if (!role.subjectId && !role.categoryId) return;
  await GigaORM.run({ caller: { id: 'permissions-live-cleanup', type: 'root' } }, async () => {
    const subject = role.subjectId ? await SubjectEntity.single(role.subjectId) : null;
    if (subject) await subject.delete();
    const category = role.categoryId ? await CategoryEntity.single(role.categoryId) : null;
    if (category) await category.delete();
  });
}

async function expectForbidden(query: string, variables: Record<string, unknown>, role: RoleRuntime) {
  await assert.rejects(() => graphqlRequest(url, role.token, query, variables, { timeoutMs: REQUEST_TIMEOUT_MS }), /Only root users|Access denied/i);
}

async function roleSweep(roleKey: RoleKey) {
  const role = runtime[roleKey];
  const schema = await graphqlRequest<{ __schema: { queryType?: { name?: string | null } | null; types?: unknown[] | null } }>(
    url,
    role.token,
    INTROSPECTION_QUERY,
    {},
    { timeoutMs: INTROSPECTION_TIMEOUT_MS },
  );
  const index = parseSchemaIndex(schema.__schema as never);
  const sampledFields = index.queryFields.slice(0, 15);
  let executed = 0;
  let unresolved = 0;
  let failed = 0;
  for (const field of sampledFields) {
    const args = valuesForArgs(field.args, index, {
      userId: role.userId,
      email: role.email,
      organizationId: role.organizationIds[0] || null,
      channelId: role.channelId,
      categoryId: role.categoryId,
      subjectId: role.subjectId,
      postId: role.subjectId,
      chatId: role.channelId,
    });
    if (args.unresolved.length) {
      unresolved += 1;
      continue;
    }
    const query = buildQueryDocument(field as SchemaField, fieldSelection(field as SchemaField, index), args.values);
    try {
      await graphqlRequest(url, role.token, query, args.values, { timeoutMs: 2_000 });
      executed += 1;
    } catch {
      failed += 1;
    }
  }
  process.stdout.write(
    `permission-sweep role:${roleKey} discovered:${index.queryFields.length} sampled:${sampledFields.length} executed:${executed} unresolved:${unresolved} failed:${failed}\n`,
  );
  assert.equal(index.queryFields.length > 0, true);
  assert.equal(executed > 0, true);
}

before(async () => {
  await ensureEntityOrmInstalled();
  for (const roleKey of ['root', 'orgAdmin', 'normal'] as RoleKey[]) {
    const identity = await resolveUser(USER_EMAILS[roleKey]);
    const token = await createUserSessionHeader(identity.userId, identity.email);
    runtime[roleKey] = {
      ...identity,
      token,
      organizationIds: await readOrganizationIds(identity.userId),
      channelId: '',
      categoryId: '',
      subjectId: '',
    };
  }
  server = await startLiveApi(port);
  for (const roleKey of ['root', 'orgAdmin', 'normal'] as RoleKey[]) await seedOwnedRecords(runtime[roleKey]);
});

after(async () => {
  for (const roleKey of ['root', 'orgAdmin', 'normal'] as RoleKey[]) await cleanupOwnedRecords(runtime[roleKey]);
  await stopLiveApi(server);
});

test('live permission matrix for organizations, user lookups, and user owned categories/subjects', async () => {
  const rootOrganizations = await graphqlRequest<{ organizations: Array<{ id: string }> }>(
    url,
    runtime.root.token,
    Q_ORGS,
    { input: {} },
    { timeoutMs: REQUEST_TIMEOUT_MS },
  );
  const orgAdminOrganizations = await graphqlRequest<{ organizations: Array<{ id: string }> }>(
    url,
    runtime.orgAdmin.token,
    Q_ORGS,
    { input: {} },
    { timeoutMs: REQUEST_TIMEOUT_MS },
  );
  const normalOrganizations = await graphqlRequest<{ organizations: Array<{ id: string }> }>(
    url,
    runtime.normal.token,
    Q_ORGS,
    { input: {} },
    { timeoutMs: REQUEST_TIMEOUT_MS },
  );
  assert.equal(rootOrganizations.organizations.length > 0, true);
  assert.equal(
    orgAdminOrganizations.organizations.every((row) => runtime.orgAdmin.organizationIds.includes(String(row.id))),
    true,
  );
  assert.equal(normalOrganizations.organizations.length, 0);

  const rootUsers = await graphqlRequest<{ users: { count: number } }>(
    url,
    runtime.root.token,
    Q_USERS,
    { input: { page: 1, limit: 5 } },
    { timeoutMs: REQUEST_TIMEOUT_MS },
  );
  assert.equal(rootUsers.users.count > 0, true);
  await expectForbidden(Q_USERS, { input: { page: 1, limit: 5 } }, runtime.orgAdmin);
  await expectForbidden(Q_USERS, { input: { page: 1, limit: 5 } }, runtime.normal);

  const rootById = await graphqlRequest<{ userById: { id: string } }>(
    url,
    runtime.root.token,
    Q_BY_ID,
    { id: runtime.normal.userId },
    { timeoutMs: REQUEST_TIMEOUT_MS },
  );
  const rootByEmail = await graphqlRequest<{ userByEmail: { id: string } }>(
    url,
    runtime.root.token,
    Q_BY_EMAIL,
    { email: runtime.normal.email },
    { timeoutMs: REQUEST_TIMEOUT_MS },
  );
  const rootByUsername = await graphqlRequest<{ userByUsername: { id: string } }>(
    url,
    runtime.root.token,
    Q_BY_USERNAME,
    {
      username: runtime.normal.username,
    },
    { timeoutMs: REQUEST_TIMEOUT_MS },
  );
  assert.equal(text(rootById.userById.id), runtime.normal.userId);
  assert.equal(text(rootByEmail.userByEmail.id), runtime.normal.userId);
  assert.equal(text(rootByUsername.userByUsername.id), runtime.normal.userId);

  const selfById = await graphqlRequest<{ userById: { id: string } }>(
    url,
    runtime.normal.token,
    Q_BY_ID,
    { id: runtime.normal.userId },
    { timeoutMs: REQUEST_TIMEOUT_MS },
  );
  assert.equal(text(selfById.userById.id), runtime.normal.userId);
  await expectForbidden(Q_BY_ID, { id: runtime.orgAdmin.userId }, runtime.normal);
  await expectForbidden(Q_BY_EMAIL, { email: runtime.normal.email }, runtime.orgAdmin);
  await expectForbidden(Q_BY_USERNAME, { username: runtime.normal.username }, runtime.orgAdmin);

  const rootSelf = await graphqlRequest<{ userById: { id: string } }>(
    url,
    runtime.root.token,
    Q_BY_ID,
    { id: runtime.root.userId },
    { timeoutMs: 10_000 },
  );
  assert.equal(text(rootSelf.userById.id), runtime.root.userId);

  for (const roleKey of ['orgAdmin', 'normal'] as RoleKey[]) {
    const role = runtime[roleKey];
    const tree = await graphqlRequest<{
      userById: {
        organisations: Array<{ id: string }>;
        categories: Array<{ id: string; createdBy: string }>;
        subjects: Array<{ id: string; createdBy: string }>;
      };
    }>(url, role.token, Q_USER_TREE, { id: role.userId }, { timeoutMs: 10_000 });
    assert.equal(
      tree.userById.categories.some((row) => String(row.id) === role.categoryId),
      true,
    );
    assert.equal(
      tree.userById.subjects.some((row) => String(row.id) === role.subjectId),
      true,
    );
    assert.equal(
      tree.userById.categories.every((row) => String(row.createdBy || '') === role.userId),
      true,
    );
    assert.equal(
      tree.userById.subjects.every((row) => String(row.createdBy || '') === role.userId),
      true,
    );
    if (roleKey === 'normal') assert.equal(tree.userById.organisations.length, 0);
  }

  await roleSweep('root');
  await roleSweep('orgAdmin');
  await roleSweep('normal');
});
