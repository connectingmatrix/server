import { createHash } from 'crypto';

type RecordValue = Record<string, any>;

function readRecord(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as RecordValue;
}

export function readOrganizationBillingMeta(value: unknown) {
  const metadata = readRecord(value);
  const billing = readRecord(metadata.billing);
  return {
    stripeCustomerId: String(billing.stripeCustomerId || '').trim(),
    currentPlanId: String(billing.currentPlanId || '').trim(),
    trialEndsAt: String(billing.trialEndsAt || '').trim(),
    orgUrl: String(billing.orgUrl || '').trim(),
    deploymentPending: billing.deploymentPending === true,
    trialUsed: billing.trialUsed === true,
    purchasedSeatCount: Number(billing.purchasedSeatCount) || 0,
  };
}

export function mergeOrganizationBillingMeta(value: unknown, nextBilling: Record<string, unknown>) {
  const metadata = readRecord(value);
  const billing = readRecord(metadata.billing);
  return {
    ...metadata,
    billing: {
      ...billing,
      ...nextBilling,
    },
  };
}

export function readMemberBillingMeta(value: unknown) {
  const metadata = readRecord(value);
  const billing = readRecord(metadata.billing);
  return {
    disabled: billing.disabled === true,
    seatRank: String(billing.seatRank || '').trim(),
    seatState: String(billing.seatState || '').trim(),
  };
}

export function mergeMemberBillingMeta(value: unknown, nextBilling: Record<string, unknown>) {
  const metadata = readRecord(value);
  const billing = readRecord(metadata.billing);
  return {
    ...metadata,
    billing: {
      ...billing,
      ...nextBilling,
    },
  };
}

export function buildSeatRank(organizationIdInput: string, userIdInput: string) {
  return createHash('sha256').update(`${organizationIdInput}:${userIdInput}`).digest('hex');
}
