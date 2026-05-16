import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseStub } from '@giga/shared/test/supabase-stub';
import { readOrganizationOwnerState, readOwnedOrganizationIds, transferOrganizationOwner } from '@giga/general/services/organization/owner';

test('readOrganizationOwnerState accepts one active owner that matches created_by', async () => {
  const supabase = createSupabaseStub({
    organizations: [{ id: 'org-1', name: 'Org 1', slug: 'org-1', created_by: 'user-1', is_active: true, billing_status: 'UNPAID' }],
    organization_members: [
      { id: 'm-1', organization_id: 'org-1', user_id: 'user-1', role: 'SUPER_ADMIN', is_disabled: false },
      { id: 'm-2', organization_id: 'org-1', user_id: 'user-2', role: 'ADMIN', is_disabled: false },
    ],
  });
  const owner = await readOrganizationOwnerState(supabase as any, 'org-1');
  assert.equal(owner.ownerUserId, 'user-1');
  assert.equal(owner.ownerMember.id, 'm-1');
});

test('readOrganizationOwnerState rejects mismatched or duplicated owners', async () => {
  const supabase = createSupabaseStub({
    organizations: [{ id: 'org-1', name: 'Org 1', slug: 'org-1', created_by: 'user-1', is_active: true, billing_status: 'UNPAID' }],
    organization_members: [
      { id: 'm-1', organization_id: 'org-1', user_id: 'user-2', role: 'SUPER_ADMIN', is_disabled: false },
      { id: 'm-2', organization_id: 'org-1', user_id: 'user-3', role: 'SUPER_ADMIN', is_disabled: false },
    ],
  });
  await assert.rejects(() => readOrganizationOwnerState(supabase as any, 'org-1'), /owner invariant is invalid/i);
});

test('readOwnedOrganizationIds returns only active orgs owned by the matching super-admin user', async () => {
  const supabase = createSupabaseStub({
    organizations: [
      { id: 'org-1', name: 'Org 1', slug: 'org-1', created_by: 'user-1', is_active: true, billing_status: 'UNPAID' },
      { id: 'org-2', name: 'Org 2', slug: 'org-2', created_by: 'user-1', is_active: false, billing_status: 'UNPAID' },
      { id: 'org-3', name: 'Org 3', slug: 'org-3', created_by: 'user-2', is_active: true, billing_status: 'UNPAID' },
    ],
  });
  const owned = await readOwnedOrganizationIds(supabase as any, 'user-1', [
    { id: 'm-1', organization_id: 'org-1', user_id: 'user-1', role: 'SUPER_ADMIN', is_disabled: false },
    { id: 'm-2', organization_id: 'org-2', user_id: 'user-1', role: 'SUPER_ADMIN', is_disabled: false },
    { id: 'm-3', organization_id: 'org-3', user_id: 'user-1', role: 'SUPER_ADMIN', is_disabled: false },
  ] as any);
  assert.deepEqual(owned, ['org-1']);
});

test('transferOrganizationOwner demotes the previous owner and updates created_by', async () => {
  const supabase = createSupabaseStub({
    organizations: [{ id: 'org-1', name: 'Org 1', slug: 'org-1', created_by: 'user-1', is_active: true, billing_status: 'UNPAID', updated_at: '' }],
    organization_members: [
      { id: 'm-1', organization_id: 'org-1', user_id: 'user-1', role: 'SUPER_ADMIN', is_disabled: false, updated_at: '' },
      { id: 'm-2', organization_id: 'org-1', user_id: 'user-2', role: 'ADMIN', is_disabled: false, updated_at: '' },
    ],
  });
  await transferOrganizationOwner(supabase as any, 'org-1', 'user-2', '2026-03-30T00:00:00.000Z');
  assert.equal((supabase as any).tables.organizations[0].created_by, 'user-2');
  assert.equal((supabase as any).tables.organization_members[0].role, 'MEMBER');
  assert.equal((supabase as any).tables.organization_members[1].role, 'SUPER_ADMIN');
});
