import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseStub } from '@giga/shared/test/supabase-stub';
import { getOrganizationAccessContext } from '@giga/general/services/organization/access';

const userPlanRows = [
  {
    id: 'starter-paid-user-policy',
    limitations: {},
    mode: 'PAID',
    node_restrictions: [],
    permissions: { WORKFLOW: { execute: true, read: true } },
    plan_id: 'starter-pack',
    scope: 'USER',
    trial_days: null,
    updated_at: null,
  },
];

const activeUserRows = [
  {
    id: 'user-1',
    stripeCustomerId: 'cus_1',
  },
];

const activeSubscriptionRows = [
  {
    id: 'sub-1',
    subscribedBy: 'user-1',
    paymentSource: 'STRIPE:user:starter-pack:paid',
    startDate: '2026-04-01T00:00:00.000Z',
    createdAt: '2026-04-01T00:00:00.000Z',
    status: 'active',
  },
];

test('getOrganizationAccessContext excludes inactive organizations from memberships', async () => {
  const supabase = createSupabaseStub({
    organization_members: [
      {
        id: 'm-active',
        organization_id: 'org-active',
        user_id: 'user-1',
        role: 'SUPER_ADMIN',
        is_disabled: false,
        metadata: {},
      },
      {
        id: 'm-inactive',
        organization_id: 'org-inactive',
        user_id: 'user-1',
        role: 'SUPER_ADMIN',
        is_disabled: false,
        metadata: {},
      },
    ],
    organizations: [
      { id: 'org-active', created_by: 'user-1', is_active: true },
      { id: 'org-inactive', is_active: false },
    ],
    User: activeUserRows,
    organization_content_restrictions: [],
    organization_node_restrictions: [],
    ai_permissions: [],
    ai_plan_policies: userPlanRows,
    Subscription: activeSubscriptionRows,
  });

  const context = await getOrganizationAccessContext(supabase as any, 'user-1');

  assert.deepEqual(context.organizationIds, ['org-active']);
  assert.deepEqual(context.superAdminOrganizationIds, ['org-active']);
  assert.equal(context.hasMembership, true);
  assert.equal(context.isSuperAdmin, true);
});

test('getOrganizationAccessContext denies permissions when all memberships belong to inactive organizations', async () => {
  const supabase = createSupabaseStub({
    organization_members: [
      {
        id: 'm-inactive',
        organization_id: 'org-inactive',
        user_id: 'user-1',
        role: 'MEMBER',
        is_disabled: false,
        metadata: {},
      },
    ],
    User: activeUserRows,
    organizations: [{ id: 'org-inactive', is_active: false }],
    organization_content_restrictions: [],
    organization_node_restrictions: [],
    ai_permissions: [],
    ai_plan_policies: userPlanRows,
    Subscription: activeSubscriptionRows,
  });

  const context = await getOrganizationAccessContext(supabase as any, 'user-1');

  assert.deepEqual(context.organizationIds, []);
  assert.equal(context.hasMembership, false);
  assert.equal(context.bypassPermissions, false);
  assert.equal(context.isRestrictedByMembership, true);
  assert.equal(context.modulePermissions.WORKFLOW?.allowRead, true);
  assert.equal(context.modulePermissions.WORKFLOW?.allowExecute, true);
});

test('getOrganizationAccessContext reads standalone user permissions when no organization is selected', async () => {
  const supabase = createSupabaseStub({
    organization_members: [],
    User: activeUserRows,
    organizations: [],
    organization_content_restrictions: [],
    organization_node_restrictions: [],
    ai_permissions: [{ scope: 'USER', organization_id: null, user_id: 'user-1', module: 'WORKFLOW', can_execute: false }],
    ai_plan_policies: userPlanRows,
    Subscription: activeSubscriptionRows,
  });

  const context = await getOrganizationAccessContext(supabase as any, 'user-1');

  assert.equal(context.permissionScope, 'USER');
  assert.equal(context.bypassPermissions, false);
  assert.equal(context.modulePermissions.WORKFLOW?.allowExecute, false);
  assert.equal(context.modulePermissions.WORKFLOW?.allowRead, true);
});
