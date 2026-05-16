import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseStub } from '@giga/shared/test/supabase-stub';
import { readBillingCheckoutTrialDays } from '@giga/general/services/billing/runtime/trial-days';

test('shared-app checkout reads trial days from ai_plan_policies', async () => {
  const supabase = createSupabaseStub({
    ai_plan_policies: [{ plan_id: 'starter-pack', mode: 'TRIAL', scope: 'USER', trial_days: 21 }],
  });

  const trialDays = await readBillingCheckoutTrialDays(supabase as any, { planId: 'starter-pack', scope: 'USER', trialUsed: false });
  assert.equal(trialDays, 21);
});

test('non-shared checkout keeps explicit static trial days and skips reused trials', async () => {
  const staticTrial = await readBillingCheckoutTrialDays(createSupabaseStub({}) as any, {
    planId: 'business',
    scope: 'ORGANIZATION',
    staticTrialDays: 2,
    trialUsed: false,
  });
  const usedTrial = await readBillingCheckoutTrialDays(createSupabaseStub({}) as any, {
    planId: 'business',
    scope: 'ORGANIZATION',
    staticTrialDays: 2,
    trialUsed: true,
  });

  assert.equal(staticTrial, 2);
  assert.equal(usedTrial, undefined);
});
