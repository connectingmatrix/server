import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseStub } from '@giga/shared/test/supabase-stub';
import { createBillingCheckoutSession, readBillingAccessState } from '@giga/general/services/billing';

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

test('billingAccessState resolves a single owned org before falling back to personal billing', async () => {
  const supabase = createSupabaseStub({
    User: [{ id: 'user-1', email: 'owner@example.com', stripeCustomerId: null }],
    organizations: [{ id: 'org-1', name: 'Org 1', slug: 'org-1', created_by: 'user-1', is_active: true, billing_status: 'UNPAID', metadata: {} }],
    organization_members: [{ id: 'm-1', organization_id: 'org-1', user_id: 'user-1', role: 'SUPER_ADMIN', is_disabled: false, metadata: {} }],
  });
  const state = await readBillingAccessState(supabase as any, 'user-1');
  assert.equal(state.organizationId, 'org-1');
  assert.equal(state.requiredRoute, 'PRICING_ORGANIZATION');
});

test('billingAccessState rejects ambiguous owner billing when multiple owned orgs exist', async () => {
  const supabase = createSupabaseStub({
    User: [{ id: 'user-1', email: 'owner@example.com', stripeCustomerId: null }],
    organizations: [
      { id: 'org-1', name: 'Org 1', slug: 'org-1', created_by: 'user-1', is_active: true, billing_status: 'UNPAID', metadata: {} },
      { id: 'org-2', name: 'Org 2', slug: 'org-2', created_by: 'user-1', is_active: true, billing_status: 'UNPAID', metadata: {} },
    ],
    organization_members: [
      { id: 'm-1', organization_id: 'org-1', user_id: 'user-1', role: 'SUPER_ADMIN', is_disabled: false, metadata: {} },
      { id: 'm-2', organization_id: 'org-2', user_id: 'user-1', role: 'SUPER_ADMIN', is_disabled: false, metadata: {} },
    ],
  });
  await assert.rejects(() => readBillingAccessState(supabase as any, 'user-1'), /Select an organization before opening organization billing/i);
});

test('createBillingCheckoutSession rejects non-owner organization checkout', async () => {
  const supabase = createSupabaseStub({
    organizations: [{ id: 'org-1', name: 'Org 1', slug: 'org-1', created_by: 'user-1', is_active: true, billing_status: 'UNPAID', metadata: {} }],
    organization_members: [
      { id: 'm-1', organization_id: 'org-1', user_id: 'user-1', role: 'SUPER_ADMIN', is_disabled: false, metadata: {} },
      { id: 'm-2', organization_id: 'org-1', user_id: 'user-2', role: 'ADMIN', is_disabled: false, metadata: {} },
    ],
  });
  await assert.rejects(
    () =>
      createBillingCheckoutSession(supabase as any, { headers: { origin: 'http://localhost:5173' } } as any, 'user-2', {
        organizationId: 'org-1',
        planId: 'business-lite',
        termId: 'monthly',
      }),
    /Only the organization owner can manage organization billing/i,
  );
});
