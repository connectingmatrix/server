import { BadRequestError } from 'routing-controllers';

export type BillingScope = 'USER' | 'ORGANIZATION';
export type BillingInterval = 'month' | 'year';

export type BillingPlanTerm = {
  id: string;
  unitAmount: number;
  interval: BillingInterval;
  intervalCount: number;
  trialDays?: number;
};

export type BillingPlan = {
  id: string;
  name: string;
  scope: BillingScope;
  terms: BillingPlanTerm[];
  manualApproval: boolean;
  seatAddon: boolean;
};

const catalog: Record<string, BillingPlan> = {
  'starter-pack': {
    id: 'starter-pack',
    name: 'Starter Pack',
    scope: 'USER',
    manualApproval: false,
    seatAddon: false,
    terms: [
      { id: 'monthly', unitAmount: 3000, interval: 'month', intervalCount: 1 },
      { id: 'annual', unitAmount: 18000, interval: 'year', intervalCount: 1 },
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    scope: 'USER',
    manualApproval: false,
    seatAddon: false,
    terms: [
      { id: 'monthly', unitAmount: 6000, interval: 'month', intervalCount: 1 },
      { id: 'annual', unitAmount: 36000, interval: 'year', intervalCount: 1 },
    ],
  },
  'business-lite': {
    id: 'business-lite',
    name: 'Business Lite',
    scope: 'ORGANIZATION',
    manualApproval: false,
    seatAddon: false,
    terms: [{ id: 'monthly', unitAmount: 10000, interval: 'month', intervalCount: 1 }],
  },
  business: {
    id: 'business',
    name: 'Business',
    scope: 'ORGANIZATION',
    manualApproval: true,
    seatAddon: false,
    terms: [
      { id: 'monthly', unitAmount: 100000, interval: 'month', intervalCount: 1, trialDays: 2 },
      { id: 'annual-1', unitAmount: 600000, interval: 'year', intervalCount: 1, trialDays: 2 },
      { id: 'annual-3', unitAmount: 1200000, interval: 'year', intervalCount: 3, trialDays: 2 },
    ],
  },
  'business-lite-seat': {
    id: 'business-lite-seat',
    name: 'Business Lite Extra Seat',
    scope: 'ORGANIZATION',
    manualApproval: false,
    seatAddon: true,
    terms: [{ id: 'monthly', unitAmount: 2500, interval: 'month', intervalCount: 1, trialDays: 0 }],
  },
};

export const USER_PLAN_IDS = ['starter-pack', 'pro'];
export const ORGANIZATION_PLAN_IDS = ['business-lite', 'business'];
export const ORGANIZATION_SEAT_PLAN_ID = 'business-lite-seat';

export function readBillingPlan(planIdInput: string, termIdInput?: string | null) {
  const planId = String(planIdInput || '').trim();
  const plan = catalog[planId];
  if (!plan) {
    throw new BadRequestError('Unsupported billing plan.');
  }

  const termId = String(termIdInput || '').trim() || plan.terms[0].id;
  const term = plan.terms.find((item) => item.id === termId);
  if (!term) {
    throw new BadRequestError('Unsupported billing term.');
  }

  return {
    plan,
    term,
  };
}

export function isUserBillingPlan(planIdInput: string) {
  return USER_PLAN_IDS.includes(String(planIdInput || '').trim());
}

export function isOrganizationBillingPlan(planIdInput: string) {
  const planId = String(planIdInput || '').trim();
  return ORGANIZATION_PLAN_IDS.includes(planId) || planId === ORGANIZATION_SEAT_PLAN_ID;
}
