import { BadRequestError } from 'routing-controllers';
import { PlanPolicyEntity } from '@connectingmatrix/orm/repositories/entities';

function sharedAppPlan(planId: string) {
  return planId === 'starter-pack' || planId === 'pro' || planId === 'business-lite';
}

export async function readBillingCheckoutTrialDays(
  _adminSupabase: any,
  input: { planId: string; scope: 'USER' | 'ORGANIZATION'; staticTrialDays?: number; trialUsed: boolean },
) {
  if (input.trialUsed) return undefined;
  if (!sharedAppPlan(input.planId)) return Number(input.staticTrialDays) || undefined;

  const trialDays = await PlanPolicyEntity.readTrialDays({ planId: input.planId, scope: input.scope });
  if (trialDays === null || trialDays === undefined) {
    throw new BadRequestError(`Missing trialDays for ${input.planId} trial policy.`);
  }

  return Number(trialDays) || undefined;
}
