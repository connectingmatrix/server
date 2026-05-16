import Stripe from 'stripe';
import { EnvLoader } from '@giga/shared/lib/env';

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  if (!stripeClient) {
    stripeClient = new Stripe(EnvLoader.getOrThrow('STRIPE_SECRET_KEY'));
  }

  return stripeClient;
}
