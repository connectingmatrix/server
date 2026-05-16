import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';
import { OrgResolver } from '@giga/general/services/graphql/resolvers/integration/org.resolver';
import { getOrganizationAccessContext } from '@giga/general/services/organization/access';

const admin = () => SupabaseClientAdmin();
const resolver = new OrgResolver();
const organizationIds = new Set<string>();
const memberIds = new Set<string>();
const permissionIds = new Set<string>();

async function activeRootUserId() {
  const result = await admin().from('app_root_users').select('user_id').eq('is_active', true).limit(1).maybeSingle();
  if (result.error || !result.data?.user_id) throw new Error(`Could not resolve an active root user. ${result.error?.message || ''}`.trim());
  return String(result.data.user_id);
}

async function nonRootUserIds(rootUserId: string) {
  const result = await admin().from('User').select('id').neq('id', rootUserId).limit(2);
  if (result.error) throw result.error;
  const ids = (result.data || []).map((row: any) => String(row.id || '')).filter(Boolean);
  if (ids.length < 2) throw new Error('At least two non-root users are required for ai_permissions live tests.');
  return [ids[0], ids[1]];
}

function context(userId: string, effectiveRoot = false) {
  return { request: { headers: {} }, supabase: admin(), body: {}, userId, effectiveRoot } as any;
}

before(async () => {
  const result = await admin().from('ai_permissions').select('id').limit(1);
  if (result.error) {
    throw new Error(
      `ai_permissions table is not available in the live Supabase environment. Apply sql/20260331_ai_permissions.sql first. Original error: ${result.error.message}`,
    );
  }
});

after(async () => {
  if (permissionIds.size) await admin().from('ai_permissions').delete().in('id', Array.from(permissionIds));
  if (memberIds.size) await admin().from('organization_members').delete().in('id', Array.from(memberIds));
  if (organizationIds.size) await admin().from('organizations').delete().in('id', Array.from(organizationIds));
});

test('live ai permissions enforce root-only baselines, baseline caps, and personal user scope', async () => {
  try {
    const rootUserId = await activeRootUserId();
    const [superAdminUserId, memberUserId] = await nonRootUserIds(rootUserId);
    const organizationId = randomUUID();
    const superAdminMemberId = randomUUID();
    const memberId = randomUUID();
    const now = new Date().toISOString();

    organizationIds.add(organizationId);
    memberIds.add(superAdminMemberId);
    memberIds.add(memberId);
    const organizationInsert = await admin()
      .from('organizations')
      .insert({
        id: organizationId,
        slug: `ai-perm-${organizationId.slice(0, 8)}`,
        name: 'AI Permission Live',
        is_active: true,
        created_by: rootUserId,
        metadata: {},
        created_at: now,
        updated_at: now,
      });
    if (organizationInsert.error) throw organizationInsert.error;
    const memberInsert = await admin()
      .from('organization_members')
      .insert([
        {
          id: superAdminMemberId,
          organization_id: organizationId,
          user_id: superAdminUserId,
          role: 'SUPER_ADMIN',
          is_disabled: false,
          metadata: {},
          created_at: now,
          updated_at: now,
        },
        {
          id: memberId,
          organization_id: organizationId,
          user_id: memberUserId,
          role: 'MEMBER',
          is_disabled: false,
          metadata: {},
          created_at: now,
          updated_at: now,
        },
      ]);
    if (memberInsert.error) throw memberInsert.error;

    const baseline = await resolver.upsertAIPermission(
      { input: { scope: 'ORGANIZATION', organizationId, module: 'WORKFLOW', canRead: false } },
      context(rootUserId, true),
    );
    permissionIds.add(baseline.id);
    await assert.rejects(
      () =>
        resolver.upsertAIPermission(
          { input: { scope: 'ORGANIZATION', organizationId, module: 'WORKFLOW', canRead: true } },
          context(superAdminUserId),
        ),
      /Only root users/i,
    );
    await assert.rejects(
      () =>
        resolver.upsertAIPermission(
          { input: { scope: 'ORGANIZATION_MEMBER', organizationId, userId: memberUserId, module: 'WORKFLOW', canRead: true } },
          context(superAdminUserId),
        ),
      /cannot allow actions denied by organization permissions/i,
    );

    const personal = await resolver.upsertAIPermission(
      { input: { scope: 'USER', userId: memberUserId, module: 'CREDENTIAL', canCreate: false } },
      context(rootUserId, true),
    );
    permissionIds.add(personal.id);

    const orgContext = await getOrganizationAccessContext(admin(), memberUserId, organizationId);
    const userContext = await getOrganizationAccessContext(admin(), memberUserId);
    assert.equal(orgContext.modulePermissions.WORKFLOW?.allowRead, false);
    assert.equal(userContext.permissionScope, 'USER');
    assert.equal(userContext.modulePermissions.CREDENTIAL?.allowCreate, false);
  } catch (error: any) {
    if (error?.code === '23514' || String(error?.message || '').includes('organization_permissions_module_check')) {
      throw new Error(
        `ai_permissions is present but still uses the old organization permission constraint. Apply sql/20260331_ai_permissions.sql fully before running this live test. Original error: ${error.message}`,
      );
    }
    throw error;
  }
});
