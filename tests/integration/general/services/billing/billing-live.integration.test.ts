import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';
import { mergeOrganizationBillingMeta, readBillingAccessState, finalizeOrganizationSignup } from '@giga/general/services/billing';
import { getStripeClient } from '@giga/general/services/billing/integration/stripe-client';

const adminSupabase = () => SupabaseClientAdmin();
const stripe = getStripeClient();
const runLive = process.env.ENABLE_STRIPE_LIVE_TESTS === 'true';
const liveTest = runLive ? test : test.skip;
const createdUsers: string[] = [];
const createdOrganizations: string[] = [];
const createdSubscriptions: string[] = [];

async function createUserRow(label: string) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const insert = await adminSupabase()
    .from('User')
    .insert({
      id,
      email: `${label}-${id.slice(0, 8)}@example.com`,
      username: `${label}-${id.slice(0, 8)}`,
      createdAt: now,
      updatedAt: now,
      isVerified: true,
    });
  if (insert.error) throw insert.error;
  createdUsers.push(id);
  return id;
}

async function createTrialSubscription(customerId: string, metadata: Record<string, string>, unitAmount: number, interval: 'month' | 'year') {
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    trial_period_days: 2,
    metadata,
    items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: unitAmount,
          recurring: { interval },
          product_data: { name: metadata.planId || 'Giga Billing Live Test' },
        },
      } as any,
    ],
  } as any);
  createdSubscriptions.push(subscription.id);
  return subscription;
}

after(async () => {
  for (const subscriptionId of createdSubscriptions) {
    await stripe.subscriptions.cancel(subscriptionId).catch(() => undefined);
  }
  if (createdOrganizations.length) {
    await adminSupabase().from('organization_members').delete().in('organization_id', createdOrganizations);
    await adminSupabase().from('organizations').delete().in('id', createdOrganizations);
  }
  if (createdUsers.length) {
    await adminSupabase().from('User').delete().in('id', createdUsers);
  }
});

liveTest('live billing resolves a personal user from pricing gate into active trial access', async () => {
  const userId = await createUserRow('billing-user');
  const initialState = await readBillingAccessState(adminSupabase(), userId);
  assert.equal(initialState.requiredRoute, 'PRICING_USER');

  const customer = await stripe.customers.create({
    email: `billing-user-${userId.slice(0, 8)}@example.com`,
    metadata: { gigaScope: 'USER', userId },
  });
  await adminSupabase().from('User').update({ stripeCustomerId: customer.id, updatedAt: new Date().toISOString() }).eq('id', userId);
  await createTrialSubscription(customer.id, { gigaScope: 'USER', userId, planId: 'starter-pack', termId: 'monthly' }, 3000, 'month');

  const nextState = await readBillingAccessState(adminSupabase(), userId);
  assert.equal(nextState.requiredRoute, 'NONE');
  assert.equal(nextState.canAccessApp, true);
  assert.equal(nextState.currentPlanId, 'starter-pack');
});

liveTest('live billing resolves a business org into pending deployment and then org url handoff', async () => {
  const ownerUserId = await createUserRow('billing-org-owner');
  const created = await finalizeOrganizationSignup(adminSupabase(), ownerUserId, {
    slug: `billing-org-${randomUUID().slice(0, 8)}`,
    name: 'Billing Org',
    description: 'Live billing org',
  });
  createdOrganizations.push(created.organizationId);

  const customer = await stripe.customers.create({
    name: created.organizationName,
    metadata: { gigaScope: 'ORGANIZATION', organizationId: created.organizationId },
  });
  const subscription = await createTrialSubscription(
    customer.id,
    { gigaScope: 'ORGANIZATION', organizationId: created.organizationId, userId: ownerUserId, planId: 'business', termId: 'monthly' },
    100000,
    'month',
  );
  await adminSupabase()
    .from('organizations')
    .update({
      metadata: mergeOrganizationBillingMeta(
        {},
        {
          stripeCustomerId: customer.id,
          currentPlanId: 'business',
          trialUsed: true,
          trialEndsAt: new Date(Number(subscription.trial_end) * 1000).toISOString(),
          purchasedSeatCount: 0,
          deploymentPending: true,
          orgUrl: '',
        },
      ),
      updated_at: new Date().toISOString(),
    })
    .eq('id', created.organizationId);

  const pendingState = await readBillingAccessState(adminSupabase(), ownerUserId, created.organizationId);
  assert.equal(pendingState.requiredRoute, 'BUSINESS_PENDING');

  const readyMetadata = mergeOrganizationBillingMeta(
    {},
    {
      stripeCustomerId: customer.id,
      currentPlanId: 'business',
      trialUsed: true,
      trialEndsAt: new Date(Number(subscription.trial_end) * 1000).toISOString(),
      purchasedSeatCount: 0,
      deploymentPending: false,
      orgUrl: 'https://org.example.com',
    },
  );
  await adminSupabase()
    .from('organizations')
    .update({ billing_status: 'PAID', metadata: readyMetadata, updated_at: new Date().toISOString() })
    .eq('id', created.organizationId);

  const readyState = await readBillingAccessState(adminSupabase(), ownerUserId, created.organizationId);
  assert.equal(readyState.requiredRoute, 'ORG_INSTANCE');
  assert.equal(readyState.orgUrl, 'https://org.example.com');
});
