import { BadRequestError } from 'routing-controllers';
import { readBillingAccessState } from '@giga/general/services/billing/runtime/service';

export async function assertBillingExecutionAccess(
  adminSupabase: any,
  input: { userId: string; organizationId?: string | null; effectiveRoot?: boolean },
) {
  const state = await readBillingAccessState(adminSupabase, input.userId, input.organizationId || null, input.effectiveRoot === true);
  if (!state.canRunWorkflows) {
    throw new BadRequestError('Billing access required. Choose a paid plan or renew billing to continue.');
  }
}
