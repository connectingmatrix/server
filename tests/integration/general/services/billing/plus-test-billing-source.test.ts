import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseStub } from '@giga/shared/test/supabase-stub';
import { readBillingAccessState, readUserBillingSource } from '@giga/general/services/billing';

test('readUserBillingSource resolves plus users to their billed base account', async () => {
  const supabase = createSupabaseStub({
    User: [
      { id: 'plus-1', email: 'owner+1@example.com', stripeCustomerId: 'cus_base' },
      { id: 'base-1', email: 'owner@example.com', stripeCustomerId: 'cus_base' },
    ],
    Subscription: [{ id: 'sub-row', subscribedBy: 'base-1', subscriptionId: 'sub_1' }],
  });

  const source = await readUserBillingSource(supabase as any, { id: 'plus-1', email: 'owner+1@example.com', stripeCustomerId: 'cus_base' });
  assert.equal(source.id, 'base-1');
  assert.equal(supabase.tables.Subscription[0].subscribedBy, 'base-1');
});

test('readBillingAccessState lets plus users inherit active stored base billing', async () => {
  const supabase = createSupabaseStub({
    User: [
      { id: 'plus-1', email: 'owner+2@example.com', stripeCustomerId: null },
      { id: 'base-1', email: 'owner@example.com', stripeCustomerId: null },
    ],
    Subscription: [{ id: 'sub-row', paymentSource: 'paypal', status: 'active', createdAt: '2026-04-01T00:00:00.000Z', subscribedBy: 'base-1' }],
    organization_members: [],
  });

  const state = await readBillingAccessState(supabase as any, 'plus-1');

  assert.equal(state.canAccessApp, true);
  assert.equal(state.currentPlanId, 'starter-pack');
  assert.equal(state.requiredRoute, 'NONE');
  assert.equal(supabase.tables.Subscription[0].subscribedBy, 'base-1');
});
