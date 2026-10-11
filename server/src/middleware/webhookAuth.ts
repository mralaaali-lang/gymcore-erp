import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import logger from '../config/logger';

/**
 * CRITICAL SECURITY FIX (found via live audit): POST /api/webhooks/payments
 * previously had NO authentication or signature check at all — it trusted
 * `metadata.subscription_id` / `member_id` / `gym_id` straight from the
 * request body. Anyone on the internet who knew (or guessed) those three
 * UUIDs could activate a subscription for free, or maliciously suspend a
 * paying member's subscription, with zero authentication.
 *
 * This verifies a shared-secret HMAC-SHA256 signature over the exact raw
 * request body before any webhook handler runs.
 *
 * IMPORTANT — this is a generic, provider-agnostic baseline, not a
 * replacement for each payment provider's own SDK verification:
 *   - Stripe: use `stripe.webhooks.constructEvent(rawBody, sig, secret)`
 *     from the official `stripe` package (handles timestamp tolerance,
 *     key rotation, and their exact header format).
 *   - Paymob / Tap / etc: use that provider's documented HMAC recipe
 *     (field order and hashed fields are usually provider-specific).
 * When you wire up a real provider, replace this generic check with that
 * provider's verification for the endpoints it owns. Until then, this
 * closes the "anyone can call this with no proof at all" hole and expects
 * the caller to send:
 *   X-Webhook-Signature: <hex HMAC-SHA256 of the raw JSON body, keyed with
 *   PAYMENT_WEBHOOK_SECRET>
 */
export function verifyPaymentWebhookSignature(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;

  if (!secret) {
    // Fail CLOSED, not open — an unconfigured secret must never mean "skip
    // verification". This should only ever happen in local dev before the
    // env var is set; production must always have this configured.
    logger.error('PAYMENT_WEBHOOK_SECRET is not configured — rejecting webhook request.');
    res.status(503).json({ error: 'Webhook receiver is not configured.' });
    return;
  }

  const signature = req.headers['x-webhook-signature'];
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

  if (!signature || typeof signature !== 'string' || !rawBody) {
    res.status(401).json({ error: 'Missing webhook signature.' });
    return;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  const sigBuf = Buffer.from(signature, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');

  const isValid = sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);

  if (!isValid) {
    logger.warn('Webhook signature mismatch — rejected.', { ip: req.ip });
    res.status(401).json({ error: 'Invalid webhook signature.' });
    return;
  }

  next();
}
