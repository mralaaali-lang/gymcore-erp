type PaymentProvider = 'stripe' | 'paymob' | 'tap';
type PaymentResult = { success: boolean; transactionId?: string; error?: string };

interface PaymentGateway {
  charge(amount: number, currency: string, metadata: Record<string, string>): Promise<PaymentResult>;
  refund(transactionId: string): Promise<PaymentResult>;
}

// -- Stripe Provider --
class StripeProvider implements PaymentGateway {
  async charge(amount: number, currency: string, metadata: Record<string, string>): Promise<PaymentResult> {
    // TODO: implement Stripe API call using stripe npm package
    return { success: true, transactionId: `stripe_${Date.now()}` };
  }
  async refund(transactionId: string): Promise<PaymentResult> {
    return { success: true };
  }
}

// -- Paymob Provider (Egypt) --
class PaymobProvider implements PaymentGateway {
  async charge(amount: number, currency: string, metadata: Record<string, string>): Promise<PaymentResult> {
    return { success: true, transactionId: `paymob_${Date.now()}` };
  }
  async refund(transactionId: string): Promise<PaymentResult> {
    return { success: true };
  }
}

// -- Tap Payments Provider (GCC) --
class TapProvider implements PaymentGateway {
  async charge(amount: number, currency: string, metadata: Record<string, string>): Promise<PaymentResult> {
    return { success: true, transactionId: `tap_${Date.now()}` };
  }
  async refund(transactionId: string): Promise<PaymentResult> {
    return { success: true };
  }
}

const DEFAULT_COUNTRY = process.env.DEFAULT_COUNTRY || 'EG';

/**
 * Returns the appropriate payment gateway based on the gym's country.
 * - Egypt -> Paymob
 * - Saudi Arabia, UAE, Qatar, Kuwait, Bahrain, Oman -> Tap
 * - All others -> Stripe
 */
export function getPaymentGateway(countryCode?: string): PaymentGateway {
  const country = (countryCode || DEFAULT_COUNTRY).toUpperCase();
  if (country === 'EG') return new PaymobProvider();
  if (['SA', 'AE', 'QA', 'KW', 'BH', 'OM'].includes(country)) return new TapProvider();
  return new StripeProvider();
}

export async function processPayment(
  countryCode: string,
  amount: number,
  currency: string,
  metadata: Record<string, string>
): Promise<PaymentResult> {
  const gateway = getPaymentGateway(countryCode);
  return gateway.charge(amount, currency, metadata);
}

export type { PaymentGateway, PaymentResult };
