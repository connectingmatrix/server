import assert from 'node:assert/strict';
import test from 'node:test';
import { readStoredSubscriptionStatus, subscriptionIsActive, subscriptionIsPaid } from '@giga/general/services/billing/runtime/subscription-status';

test('readStoredSubscriptionStatus keeps trialing subscriptions active in storage', () => {
  assert.equal(readStoredSubscriptionStatus('trialing'), 'active');
  assert.equal(subscriptionIsActive('trialing'), true);
  assert.equal(subscriptionIsPaid('trialing'), false);
});

test('readStoredSubscriptionStatus expires non-active Stripe statuses', () => {
  assert.equal(readStoredSubscriptionStatus('canceled'), 'expired');
  assert.equal(readStoredSubscriptionStatus('past_due'), 'expired');
  assert.equal(subscriptionIsActive('past_due'), false);
  assert.equal(subscriptionIsPaid('active'), true);
});
