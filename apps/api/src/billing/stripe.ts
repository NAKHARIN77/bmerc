import Stripe from 'stripe';

// Card payments for plan invoices go through Stripe Checkout (Stripe's own payment page), so card numbers
// never reach BMERC. Set STRIPE_SECRET_KEY to turn them on, and STRIPE_WEBHOOK_SECRET for the endpoint
// Stripe calls when a payment completes (Stripe Dashboard → Developers → Webhooks).

let client: Stripe | null | undefined;

/** The Stripe client, or null while card payments are not set up. */
export function stripe(): Stripe | null {
  if (client === undefined) {
    // STRIPE_API_URL is for testing against stripe-mock (e.g. http://localhost:12111); leave it unset in production.
    const mock = process.env.STRIPE_API_URL ? new URL(process.env.STRIPE_API_URL) : null;
    const where = mock ? { host: mock.hostname, port: Number(mock.port), protocol: mock.protocol.replace(':', '') as 'http' | 'https' } : {};
    client = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, where) : null;
  }
  return client;
}

export const cardPaymentsOn = () => !!process.env.STRIPE_SECRET_KEY;

/** Verifies the Stripe-Signature header against the raw body. Needs only the webhook secret, not the API key. */
export function verifyWebhook(rawBody: Buffer, signature: string, secret: string): Stripe.Event {
  return (stripe() ?? new Stripe('sk_placeholder_webhook_verification_only')).webhooks.constructEvent(rawBody, signature, secret);
}

/** For tests: a valid Stripe-Signature header for this payload. */
export function testSignature(payload: string, secret: string): string {
  return new Stripe('sk_placeholder_webhook_verification_only').webhooks.generateTestHeaderString({ payload, secret });
}
