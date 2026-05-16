import { Request } from 'express';
import Stripe from 'stripe';
import { BadRequestError } from 'routing-controllers';
import { EnvLoader } from '@giga/shared/lib/env';
import { OrganizationMemberEntity } from '@connectingmatrix/orm/repositories/entities/runtime/OrganizationMemberEntity';
import { OrganisationEntity } from '@connectingmatrix/orm/repositories/entities/runtime/OrganisationEntity';
import { SubscriptionEntity } from '@connectingmatrix/orm/repositories/entities/runtime/SubscriptionEntity';
import { UserEntity } from '@connectingmatrix/orm/repositories/entities/runtime/UserEntity';
import { readPlusTestEmail } from '@giga/permissions/services/auth/plus-test-email';
import { saveOrganizationTreeNode } from '@giga/general/services/giga/runtime/organization-tree-node';
import { readOrganizationOwnerState, readOwnedOrganizationIds, requireOrganizationOwner } from '@giga/general/services/organization/owner';
import { getActiveOrganizationIds } from '@giga/general/services/organization/access';
import {
  buildSeatRank,
  mergeMemberBillingMeta,
  mergeOrganizationBillingMeta,
  readMemberBillingMeta,
  readOrganizationBillingMeta,
} from '@giga/general/services/billing/runtime/metadata';
import {
  ORGANIZATION_PLAN_IDS,
  ORGANIZATION_SEAT_PLAN_ID,
  USER_PLAN_IDS,
  isOrganizationBillingPlan,
  isUserBillingPlan,
  readBillingPlan,
} from '@giga/general/services/billing/runtime/plans';
import { readStoredSubscriptionStatus, subscriptionIsActive, subscriptionIsPaid } from '@giga/general/services/billing/runtime/subscription-status';
import { readBillingCheckoutTrialDays } from '@giga/general/services/billing/runtime/trial-days';
import { getStripeClient } from '@giga/general/services/billing/integration/stripe-client';

type BillingRoute = 'NONE' | 'PRICING_USER' | 'PRICING_ORGANIZATION' | 'BUSINESS_PENDING' | 'ORG_INSTANCE';
type BillingSubject = 'ROOT' | 'USER' | 'ORGANIZATION';
type UserRow = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  stripeCustomerId?: string | null;
  subscriptions?: StoredSubscriptionRow[];
};
type StoredSubscriptionRow = {
  createdAt?: string | null;
  expiresAt?: string | null;
  nextBillingDate?: string | null;
  paymentSource?: string | null;
  startDate?: string | null;
  status?: string | null;
};
type StoredSubscriptionMeta = { mode: 'PAID' | 'TRIAL'; planId: string; scope: 'ORGANIZATION' | 'USER' };
type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  created_by?: string | null;
  billing_status?: string | null;
  metadata?: unknown;
  is_active?: boolean;
};
type MembershipRow = { id: string; organization_id: string; user_id: string; role?: string | null; is_disabled?: boolean | null; metadata?: unknown };

export type BillingAccessState = {
  subjectType: BillingSubject;
  requiredRoute: BillingRoute;
  homePath: string;
  organizationId: string | null;
  organizationName: string | null;
  currentPlanId: string | null;
  billingStatus: string;
  canAccessApp: boolean;
  canRunWorkflows: boolean;
  hasCustomer: boolean;
  trialUsed: boolean;
  trialEndsAt: string | null;
  purchasedSeatCount: number;
  activeSeatCount: number;
  remainingSeatCount: number;
  orgUrl: string | null;
};

function readIsoDate(unixInput?: number | null) {
  const unix = Number(unixInput) || 0;
  return unix ? new Date(unix * 1000).toISOString() : null;
}

function readPaymentSource(scope: 'user' | 'organization', planId: string, status: string, organizationId?: string | null) {
  if (scope === 'organization') {
    return `STRIPE:${scope}:${String(organizationId || '').trim()}:${planId}:${status}`;
  }
  return `STRIPE:${scope}:${planId}:${status}`;
}

function readStoredPaymentSource(value: string): StoredSubscriptionMeta | null {
  const source = String(value || '').trim();
  if (!source) return null;
  const parts = source.split(':');
  if (parts[0] !== 'STRIPE') return { mode: 'PAID', planId: USER_PLAN_IDS[0], scope: 'USER' };
  if (parts[1] === 'user' && parts[2]) return { mode: parts[3] === 'trialing' ? 'TRIAL' : 'PAID', planId: parts[2], scope: 'USER' };
  if (parts[1] === 'organization' && parts[2] && parts[3])
    return { mode: parts[4] === 'trialing' ? 'TRIAL' : 'PAID', planId: parts[3], scope: 'ORGANIZATION' };
  return null;
}

function readStoredSubscription(rows: StoredSubscriptionRow[], scope: 'ORGANIZATION' | 'USER') {
  let current: { meta: StoredSubscriptionMeta; row: StoredSubscriptionRow } | null = null;
  for (const row of rows || []) {
    const meta = readStoredPaymentSource(String(row?.paymentSource || ''));
    if (!meta || meta.scope !== scope || !subscriptionIsActive(String(row?.status || ''))) continue;
    const currentDate = String(current?.row.createdAt || current?.row.startDate || '');
    const nextDate = String(row.createdAt || row.startDate || '');
    if (!current || nextDate.localeCompare(currentDate) > 0) current = { meta, row };
  }
  return current;
}

function readStoredBillingAccess(rows: StoredSubscriptionRow[]): BillingAccessState | null {
  const current = readStoredSubscription(rows, 'USER') || readStoredSubscription(rows, 'ORGANIZATION');
  if (!current) return null;
  return {
    subjectType: 'USER',
    requiredRoute: 'NONE',
    homePath: '/chat',
    organizationId: null,
    organizationName: null,
    currentPlanId: current.meta.planId,
    billingStatus: current.meta.mode === 'PAID' ? 'PAID' : 'UNPAID',
    canAccessApp: true,
    canRunWorkflows: true,
    hasCustomer: true,
    trialUsed: current.meta.mode === 'TRIAL',
    trialEndsAt: current.row.expiresAt || current.row.nextBillingDate || null,
    purchasedSeatCount: 0,
    activeSeatCount: 0,
    remainingSeatCount: 0,
    orgUrl: null,
  };
}

function readOriginUrl(request?: Request | null) {
  const origin = String(request?.headers?.origin || '').trim();
  if (origin) return origin.replace(/\/+$/g, '');
  const referer = String(request?.headers?.referer || '').trim();
  if (referer) return referer.replace(/\/+$/, '').replace(/\/[^/]*$/, '');
  return String(EnvLoader.get('UI_BASE_URL') || 'http://localhost:3000').replace(/\/+$/g, '');
}

function readSubscriptionPlanId(subscription: Stripe.Subscription) {
  return String(subscription.metadata?.planId || '').trim();
}

function readSubscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const directValue = Number((subscription as any).current_period_end) || 0;
  if (directValue) {
    return directValue;
  }

  return Number(subscription.items.data[0]?.current_period_end) || 0;
}

function readTrialUsed(subscriptions: Stripe.Subscription[]) {
  return subscriptions.some((subscription) => Number(subscription.trial_start) || Number(subscription.trial_end));
}

function readActiveSubscription(subscriptions: Stripe.Subscription[], planIds: string[]) {
  return (
    subscriptions.find((subscription) => {
      const planId = readSubscriptionPlanId(subscription);
      return planIds.includes(planId) && subscriptionIsActive(subscription.status);
    }) || null
  );
}

function readPaidSubscription(subscriptions: Stripe.Subscription[], planIds: string[]) {
  return (
    subscriptions.find((subscription) => {
      const planId = readSubscriptionPlanId(subscription);
      return planIds.includes(planId) && subscriptionIsPaid(subscription.status);
    }) || null
  );
}

async function readUser(_adminSupabase: any, userId: string) {
  const result = await UserEntity.find({ id: userId }).select('id,email,firstName,lastName,name,stripeCustomerId').single();
  if (!result?.id) throw new BadRequestError('Authenticated user not found.');
  return result as UserRow;
}

export async function readUserBillingSource(adminSupabase: any, user: UserRow): Promise<UserRow> {
  const spec = readPlusTestEmail(user.email);
  if (!spec) return user;
  const result = await UserEntity.find({ email: spec.baseEmail }).select('id,email,firstName,lastName,name,stripeCustomerId').single();
  if (!result?.id) throw new BadRequestError('Base account for plus-email test login does not exist.');
  const subscriptions = await SubscriptionEntity.findByUserId(String(result.id));
  if (!String(result.stripeCustomerId || '').trim() && !readStoredBillingAccess(subscriptions))
    throw new BadRequestError('Base account for plus-email test login does not have Stripe billing configured.');
  return { ...(result as UserRow), subscriptions };
}

async function readMemberships(_adminSupabase: any, userId: string) {
  return (await OrganizationMemberEntity.listActiveRowsByUserId(userId)) as MembershipRow[];
}

async function readOrganization(_adminSupabase: any, organizationId: string) {
  const result = await OrganisationEntity.find({ id: organizationId }).select('id,name,slug,created_by,billing_status,metadata,is_active').single();
  if (!result?.id) throw new BadRequestError('Organization not found.');
  return result as OrganizationRow;
}

async function saveSubscriptions(adminSupabase: any, subscribedBy: string, subscriptions: Stripe.Subscription[], organizationId?: string | null) {
  for (const subscription of subscriptions) {
    const planId = readSubscriptionPlanId(subscription);
    const scope = isUserBillingPlan(planId) ? 'user' : 'organization';
    const existing = await SubscriptionEntity.findBySubscriptionId(subscription.id);
    const payload = {
      orderId: subscription.id,
      paymentSource: readPaymentSource(scope, planId, subscription.status, organizationId),
      plansId: null,
      subscribedBy,
      subscriptionId: subscription.id,
      status: readStoredSubscriptionStatus(subscription.status),
      startDate: readIsoDate(Number((subscription as any).current_period_start) || subscription.start_date),
      nextBillingDate: readIsoDate(readSubscriptionPeriodEnd(subscription)),
      expiresAt: readIsoDate(subscription.trial_end || readSubscriptionPeriodEnd(subscription)),
      autoRenew: subscription.cancel_at_period_end !== true,
      cancelledAt: readIsoDate(subscription.canceled_at),
      updatedAt: new Date().toISOString(),
    };
    await SubscriptionEntity.createOrUpdateById({
      ...payload,
      id: String(existing?.id || '') || null,
    });
  }
}

async function readCustomerSubscriptions(customerId: string) {
  const stripe = getStripeClient();
  const result = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
  return result.data || [];
}

async function enforceBusinessLiteSeats(adminSupabase: any, organization: OrganizationRow, purchasedSeatCount: number) {
  const members = (await OrganizationMemberEntity.findByOrganizationId(organization.id)) as MembershipRow[];
  const { ownerUserId } = await readOrganizationOwnerState(adminSupabase, organization.id);
  const managed = members.filter(
    (member) => member.user_id !== ownerUserId && !(member.is_disabled === true && readMemberBillingMeta(member.metadata).disabled !== true),
  );
  const allowed = Math.max(0, purchasedSeatCount - (ownerUserId ? 1 : 0));
  const ranked = managed
    .map((member) => ({
      member,
      meta: readMemberBillingMeta(member.metadata),
      rank: readMemberBillingMeta(member.metadata).seatRank || buildSeatRank(organization.id, member.user_id),
    }))
    .sort((left, right) => left.rank.localeCompare(right.rank));

  for (let index = 0; index < ranked.length; index += 1) {
    const entry = ranked[index];
    const shouldDisable = index >= allowed;
    const metadata = mergeMemberBillingMeta(entry.member.metadata, {
      disabled: shouldDisable,
      seatState: shouldDisable ? 'DEACTIVATED' : 'ACTIVE',
      seatRank: entry.rank,
    });
    const update = {
      metadata,
      is_disabled: shouldDisable,
      updated_at: new Date().toISOString(),
    };
    if (
      entry.member.is_disabled !== shouldDisable ||
      entry.meta.disabled !== shouldDisable ||
      entry.meta.seatRank !== entry.rank ||
      entry.meta.seatState !== (shouldDisable ? 'DEACTIVATED' : 'ACTIVE')
    ) {
      await OrganizationMemberEntity.updateById(entry.member.id, update);
    }
  }

  const activeSeatCount = (ownerUserId ? 1 : 0) + Math.min(allowed, ranked.length);
  return {
    activeSeatCount,
    remainingSeatCount: Math.max(0, purchasedSeatCount - activeSeatCount),
  };
}

async function syncUserBilling(adminSupabase: any, user: UserRow): Promise<BillingAccessState> {
  const billingUser = await readUserBillingSource(adminSupabase, user);
  if (billingUser.id !== user.id) {
    return syncUserBilling(adminSupabase, billingUser);
  }

  const storedAccess = readStoredBillingAccess(user.subscriptions || []);
  if (storedAccess) return storedAccess;

  if (!String(user.stripeCustomerId || '').trim()) {
    return {
      subjectType: 'USER',
      requiredRoute: 'PRICING_USER',
      homePath: '/pricing/user',
      organizationId: null,
      organizationName: null,
      currentPlanId: null,
      billingStatus: 'UNPAID',
      canAccessApp: false,
      canRunWorkflows: false,
      hasCustomer: false,
      trialUsed: false,
      trialEndsAt: null,
      purchasedSeatCount: 0,
      activeSeatCount: 0,
      remainingSeatCount: 0,
      orgUrl: null,
    };
  }

  const subscriptions = await readCustomerSubscriptions(String(user.stripeCustomerId || '').trim());
  await saveSubscriptions(
    adminSupabase,
    user.id,
    subscriptions.filter((subscription) => USER_PLAN_IDS.includes(readSubscriptionPlanId(subscription))),
  );
  const activeSubscription = readActiveSubscription(subscriptions, USER_PLAN_IDS);
  const paidSubscription = readPaidSubscription(subscriptions, USER_PLAN_IDS);
  return {
    subjectType: 'USER',
    requiredRoute: activeSubscription ? 'NONE' : 'PRICING_USER',
    homePath: activeSubscription ? '/chat' : '/pricing/user',
    organizationId: null,
    organizationName: null,
    currentPlanId: readSubscriptionPlanId(activeSubscription || paidSubscription || subscriptions[0] || ({} as Stripe.Subscription)) || null,
    billingStatus: paidSubscription ? 'PAID' : 'UNPAID',
    canAccessApp: Boolean(activeSubscription),
    canRunWorkflows: Boolean(activeSubscription),
    hasCustomer: true,
    trialUsed: readTrialUsed(subscriptions),
    trialEndsAt: readIsoDate(activeSubscription?.trial_end || subscriptions[0]?.trial_end),
    purchasedSeatCount: 0,
    activeSeatCount: 0,
    remainingSeatCount: 0,
    orgUrl: null,
  };
}

export async function syncBillingForUserId(adminSupabase: any, userId: string): Promise<BillingAccessState> {
  return syncUserBilling(adminSupabase, await readUser(adminSupabase, userId));
}

async function syncOrganizationBilling(adminSupabase: any, organization: OrganizationRow, actorUserId: string): Promise<BillingAccessState> {
  const owner = await readOrganizationOwnerState(adminSupabase, organization.id);
  const billingMeta = readOrganizationBillingMeta(organization.metadata);
  if (!billingMeta.stripeCustomerId) {
    return {
      subjectType: 'ORGANIZATION',
      requiredRoute: 'PRICING_ORGANIZATION',
      homePath: '/pricing/organization',
      organizationId: organization.id,
      organizationName: organization.name,
      currentPlanId: null,
      billingStatus: String(organization.billing_status || 'UNPAID'),
      canAccessApp: false,
      canRunWorkflows: false,
      hasCustomer: false,
      trialUsed: false,
      trialEndsAt: null,
      purchasedSeatCount: 0,
      activeSeatCount: 0,
      remainingSeatCount: 0,
      orgUrl: null,
    };
  }

  const subscriptions = await readCustomerSubscriptions(billingMeta.stripeCustomerId);
  await saveSubscriptions(
    adminSupabase,
    owner.ownerUserId || actorUserId,
    subscriptions.filter((subscription) => isOrganizationBillingPlan(readSubscriptionPlanId(subscription))),
    organization.id,
  );
  const businessLiteBase = readActiveSubscription(subscriptions, ['business-lite']);
  const businessBase = readActiveSubscription(subscriptions, ['business']);
  const paidLite = readPaidSubscription(subscriptions, ['business-lite']);
  const paidBusiness = readPaidSubscription(subscriptions, ['business']);
  const addonSeats = subscriptions
    .filter((subscription) => readSubscriptionPlanId(subscription) === ORGANIZATION_SEAT_PLAN_ID && subscriptionIsActive(subscription.status))
    .reduce((total, subscription) => total + Number(subscription.items.data[0]?.quantity || 1), 0);
  const currentPlanId =
    readSubscriptionPlanId(businessBase || businessLiteBase || paidBusiness || paidLite || subscriptions[0] || ({} as Stripe.Subscription)) || null;
  const purchasedSeatCount = currentPlanId === 'business-lite' ? 1 + addonSeats : currentPlanId === 'business' ? 999999 : 0;
  const seatState =
    currentPlanId === 'business-lite'
      ? await enforceBusinessLiteSeats(adminSupabase, organization, purchasedSeatCount)
      : { activeSeatCount: purchasedSeatCount ? 1 : 0, remainingSeatCount: 0 };
  const trialUsed = readTrialUsed(subscriptions);
  const trialEndsAt = readIsoDate((businessBase || businessLiteBase)?.trial_end || subscriptions[0]?.trial_end);
  const orgUrl = billingMeta.orgUrl || '';
  const deploymentPending = currentPlanId === 'business' && !orgUrl;
  const billingStatus = currentPlanId === 'business' ? String(organization.billing_status || 'UNPAID') : paidLite ? 'PAID' : 'UNPAID';
  const metadata = mergeOrganizationBillingMeta(organization.metadata, {
    stripeCustomerId: billingMeta.stripeCustomerId,
    currentPlanId,
    trialEndsAt,
    trialUsed,
    purchasedSeatCount,
    deploymentPending,
    orgUrl,
  });
  const update = await adminSupabase
    .from('organizations')
    .update({ metadata, billing_status: billingStatus, updated_at: new Date().toISOString() })
    .eq('id', organization.id);
  if (update.error) throw update.error;

  if (orgUrl && billingStatus === 'PAID') {
    return {
      subjectType: 'ORGANIZATION',
      requiredRoute: 'ORG_INSTANCE',
      homePath: '/billing/organization/pending',
      organizationId: organization.id,
      organizationName: organization.name,
      currentPlanId,
      billingStatus,
      canAccessApp: false,
      canRunWorkflows: false,
      hasCustomer: true,
      trialUsed,
      trialEndsAt,
      purchasedSeatCount,
      activeSeatCount: seatState.activeSeatCount,
      remainingSeatCount: seatState.remainingSeatCount,
      orgUrl,
    };
  }

  if (deploymentPending && (businessBase || paidBusiness)) {
    return {
      subjectType: 'ORGANIZATION',
      requiredRoute: 'BUSINESS_PENDING',
      homePath: '/billing/organization/pending',
      organizationId: organization.id,
      organizationName: organization.name,
      currentPlanId,
      billingStatus,
      canAccessApp: false,
      canRunWorkflows: false,
      hasCustomer: true,
      trialUsed,
      trialEndsAt,
      purchasedSeatCount,
      activeSeatCount: seatState.activeSeatCount,
      remainingSeatCount: seatState.remainingSeatCount,
      orgUrl: null,
    };
  }

  if (businessLiteBase || paidLite) {
    return {
      subjectType: 'ORGANIZATION',
      requiredRoute: 'NONE',
      homePath: `/org/${organization.id}/chat`,
      organizationId: organization.id,
      organizationName: organization.name,
      currentPlanId,
      billingStatus,
      canAccessApp: true,
      canRunWorkflows: true,
      hasCustomer: true,
      trialUsed,
      trialEndsAt,
      purchasedSeatCount,
      activeSeatCount: seatState.activeSeatCount,
      remainingSeatCount: seatState.remainingSeatCount,
      orgUrl: null,
    };
  }

  return {
    subjectType: 'ORGANIZATION',
    requiredRoute: 'PRICING_ORGANIZATION',
    homePath: '/pricing/organization',
    organizationId: organization.id,
    organizationName: organization.name,
    currentPlanId,
    billingStatus: 'UNPAID',
    canAccessApp: false,
    canRunWorkflows: false,
    hasCustomer: true,
    trialUsed,
    trialEndsAt,
    purchasedSeatCount,
    activeSeatCount: seatState.activeSeatCount,
    remainingSeatCount: seatState.remainingSeatCount,
    orgUrl: null,
  };
}

export async function readBillingAccessState(adminSupabase: any, userId: string, organizationIdInput?: string | null, effectiveRoot = false) {
  if (effectiveRoot) {
    return {
      subjectType: 'ROOT',
      requiredRoute: 'NONE',
      homePath: '/chat',
      organizationId: null,
      organizationName: null,
      currentPlanId: null,
      billingStatus: 'PAID',
      canAccessApp: true,
      canRunWorkflows: true,
      hasCustomer: false,
      trialUsed: false,
      trialEndsAt: null,
      purchasedSeatCount: 0,
      activeSeatCount: 0,
      remainingSeatCount: 0,
      orgUrl: null,
    };
  }

  const memberships = await readMemberships(adminSupabase, userId);
  const organizationIds = memberships.map((membership) => membership.organization_id);
  const activeOrganizationIds = await getActiveOrganizationIds(adminSupabase, organizationIds);
  const activeMemberships = memberships.filter((membership) => activeOrganizationIds.includes(membership.organization_id));
  const ownedOrganizationIds = await readOwnedOrganizationIds(adminSupabase, userId, activeMemberships);
  const selectedOrganizationId = String(organizationIdInput || '').trim();
  if (selectedOrganizationId) {
    if (!activeOrganizationIds.includes(selectedOrganizationId)) {
      throw new BadRequestError('Organization access is not available.');
    }
    return syncOrganizationBilling(adminSupabase, await readOrganization(adminSupabase, selectedOrganizationId), userId);
  }
  if (ownedOrganizationIds.length > 1) {
    throw new BadRequestError('Select an organization before opening organization billing.');
  }
  const organizationId = ownedOrganizationIds[0] || activeOrganizationIds[0];
  if (organizationId) {
    return syncOrganizationBilling(adminSupabase, await readOrganization(adminSupabase, organizationId), userId);
  }

  return syncUserBilling(adminSupabase, await readUser(adminSupabase, userId));
}

export async function createBillingCheckoutSession(
  adminSupabase: any,
  request: Request,
  userId: string,
  input: { organizationId?: string | null; planId: string; termId?: string | null; seatQuantity?: number | null },
  effectiveRoot = false,
) {
  const { plan, term } = readBillingPlan(input.planId, input.termId);
  const stripe = getStripeClient();
  const origin = readOriginUrl(request);
  const seatQuantity = Math.max(1, Number(input.seatQuantity) || 1);

  if (plan.scope === 'USER') {
    const user = await readUser(adminSupabase, userId);
    const customerId =
      String(user.stripeCustomerId || '').trim() ||
      (
        await stripe.customers.create({
          email: user.email,
          name: String(user.name || `${user.firstName || ''} ${user.lastName || ''}`).trim(),
          metadata: { gigaScope: 'USER', userId },
        })
      ).id;
    if (!String(user.stripeCustomerId || '').trim()) {
      await UserEntity.updateById(userId, { stripeCustomerId: customerId, updatedAt: new Date().toISOString() });
    }

    const subscriptions = await readCustomerSubscriptions(customerId);
    const activePlan = readActiveSubscription(subscriptions, USER_PLAN_IDS);
    if (activePlan && readSubscriptionPlanId(activePlan) === plan.id) {
      throw new BadRequestError('This plan is already active.');
    }
    const trialDays = await readBillingCheckoutTrialDays(adminSupabase, {
      planId: plan.id,
      scope: plan.scope,
      staticTrialDays: term.trialDays,
      trialUsed: readTrialUsed(subscriptions),
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      success_url: `${origin}/billing/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing/user`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: term.unitAmount,
            recurring: { interval: term.interval, interval_count: term.intervalCount },
            product_data: { name: plan.name, metadata: { planId: plan.id, userId, gigaScope: 'USER' } },
          },
        },
      ],
      metadata: { gigaScope: 'USER', userId, planId: plan.id, termId: term.id },
      subscription_data: {
        metadata: { gigaScope: 'USER', userId, planId: plan.id, termId: term.id },
        trial_period_days: trialDays,
      },
    });
    const sessionUrl = String(session.url || '').trim();
    if (!sessionUrl) throw new BadRequestError('Stripe checkout session URL is missing.');
    return { sessionId: session.id, sessionUrl };
  }

  const organizationId = String(input.organizationId || '').trim();
  if (!organizationId) throw new BadRequestError('organizationId is required for organization billing.');
  const organization = await readOrganization(adminSupabase, organizationId);
  if (effectiveRoot) {
    await readOrganizationOwnerState(adminSupabase, organizationId);
  } else {
    await requireOrganizationOwner(adminSupabase, organizationId, userId);
  }
  const billingMeta = readOrganizationBillingMeta(organization.metadata);
  const customerId =
    billingMeta.stripeCustomerId ||
    (await stripe.customers.create({ name: organization.name, metadata: { gigaScope: 'ORGANIZATION', organizationId } })).id;
  if (!billingMeta.stripeCustomerId) {
    const metadata = mergeOrganizationBillingMeta(organization.metadata, { stripeCustomerId: customerId });
    await OrganisationEntity.updateById(organizationId, { metadata, updatedAt: new Date().toISOString() });
  }

  const subscriptions = await readCustomerSubscriptions(customerId);
  const activeBase = readActiveSubscription(subscriptions, ORGANIZATION_PLAN_IDS);
  if (!plan.seatAddon && activeBase && readSubscriptionPlanId(activeBase) === plan.id) {
    throw new BadRequestError('This organization plan is already active.');
  }
  if (plan.id === ORGANIZATION_SEAT_PLAN_ID && readSubscriptionPlanId(activeBase || ({} as Stripe.Subscription)) !== 'business-lite') {
    throw new BadRequestError('Extra seats are only available for Business Lite.');
  }
  const trialDays = await readBillingCheckoutTrialDays(adminSupabase, {
    planId: plan.id,
    scope: plan.scope,
    staticTrialDays: term.trialDays,
    trialUsed: readTrialUsed(subscriptions),
  });

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    success_url: `${origin}/billing/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing/organization`,
    line_items: [
      {
        quantity: plan.seatAddon ? seatQuantity : 1,
        price_data: {
          currency: 'usd',
          unit_amount: term.unitAmount,
          recurring: { interval: term.interval, interval_count: term.intervalCount },
          product_data: { name: plan.name, metadata: { planId: plan.id, organizationId, gigaScope: 'ORGANIZATION' } },
        },
      },
    ],
    metadata: { gigaScope: 'ORGANIZATION', userId, organizationId, planId: plan.id, termId: term.id },
    subscription_data: {
      metadata: { gigaScope: 'ORGANIZATION', userId, organizationId, planId: plan.id, termId: term.id },
      trial_period_days: trialDays,
    },
  });
  const sessionUrl = String(session.url || '').trim();
  if (!sessionUrl) throw new BadRequestError('Stripe checkout session URL is missing.');
  return { sessionId: session.id, sessionUrl };
}

export async function finalizeOrganizationSignup(
  adminSupabase: any,
  userId: string,
  input: { slug: string; name: string; description?: string | null },
) {
  const memberships = await readMemberships(adminSupabase, userId);
  if (memberships.length) {
    throw new BadRequestError('This user already belongs to an organization.');
  }

  const now = new Date().toISOString();
  const organizationInsert = await OrganisationEntity.create({
    slug: input.slug,
    name: input.name,
    description: input.description || null,
    is_active: true,
    created_by: userId,
    created_at: now,
    updated_at: now,
    billing_status: 'UNPAID',
    metadata: mergeOrganizationBillingMeta(
      {},
      { currentPlanId: '', trialUsed: false, trialEndsAt: '', purchasedSeatCount: 0, deploymentPending: false, orgUrl: '' },
    ),
  });

  await OrganizationMemberEntity.createOrUpdateByOrganizationAndUser({
    organization_id: organizationInsert.id,
    user_id: userId,
    role: 'SUPER_ADMIN',
    is_disabled: false,
    metadata: mergeMemberBillingMeta({}, { disabled: false, seatState: 'ACTIVE', seatRank: buildSeatRank(String(organizationInsert.id), userId) }),
    updated_at: now,
  });
  await saveOrganizationTreeNode({
    id: String(organizationInsert.id),
    slug: String(organizationInsert.slug || ''),
    name: String(organizationInsert.name || ''),
    description: input.description || null,
    createdBy: userId,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  return {
    organizationId: String(organizationInsert.id),
    organizationName: String(organizationInsert.name || ''),
    organizationSlug: String(organizationInsert.slug || ''),
  };
}
