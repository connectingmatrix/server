export function subscriptionIsActive(status: string) {
  return status === 'active' || status === 'trialing';
}

export function subscriptionIsPaid(status: string) {
  return status === 'active';
}

export function readStoredSubscriptionStatus(status: string) {
  if (subscriptionIsActive(status)) {
    return 'active';
  }

  return 'expired';
}
