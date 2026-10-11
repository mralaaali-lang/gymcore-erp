import { Request, Response } from 'express';
import { query } from '../config/database';
import { setTenantGymId } from '../config/tenantContext';
import logger from '../config/logger';

/**
 * Generic payment webhook handler.
 * Expects: provider (stripe|paymob|tap), status (success|failure),
 *          transaction_id, metadata.member_id, metadata.gym_id, metadata.subscription_id
 *
 * Route-level protection: see middleware/webhookAuth.ts — this only runs
 * after the HMAC signature check passes.
 */
export async function handlePaymentWebhook(req: Request, res: Response): Promise<void> {
  const { provider, status, transaction_id, metadata } = req.body;

  if (!provider || !status || !transaction_id || !metadata?.member_id || !metadata?.gym_id) {
    res.status(400).json({ error: 'Invalid webhook payload' });
    return;
  }

  // BUG FOUND VIA AUDIT: this route has no staff JWT (it's a payment
  // provider calling us, not a logged-in user), so nothing ever set the
  // tenant context before this fix — every query() call below was
  // silently blocked by RLS (member_subscriptions and activity_logs are
  // both RLS-scoped to current_gym_id(), which was NULL here). The
  // handler always returned `{ received: true }` while actually updating
  // ZERO rows — a silent no-op that looked successful.
  setTenantGymId(metadata.gym_id);

  try {
    // Idempotency: payment providers retry webhook delivery on any
    // ambiguous response (timeout, 5xx, etc.), and a malicious replay of a
    // captured "success" event would otherwise just re-activate a
    // subscription indefinitely for a single real payment.
    try {
      await query(
        `INSERT INTO webhook_events (provider, transaction_id) VALUES ($1, $2)`,
        [provider, transaction_id]
      );
    } catch (e: unknown) {
      if ((e as { code?: string }).code === '23505') {
        logger.info('Duplicate webhook event ignored', { transaction_id, provider });
        res.status(200).json({ received: true, duplicate: true });
        return;
      }
      throw e;
    }

    if (status === 'success') {
      const subResult = await query(
        `UPDATE member_subscriptions SET status = 'active'
         WHERE id = $1 AND member_id = $2 AND gym_id = $3
         RETURNING id`,
        [metadata.subscription_id, metadata.member_id, metadata.gym_id]
      );

      if (subResult.rows.length === 0) {
        logger.warn('Payment webhook matched no subscription', { transaction_id, provider, metadata });
      }

      await query(
        `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
         VALUES ($1, NULL, $2, $3)`,
        [metadata.gym_id, `Payment success: ${transaction_id} via ${provider}`, req.ip]
      );

      logger.info('Subscription activated via webhook', { transaction_id, provider, memberId: metadata.member_id });
    } else {
      await query(
        `UPDATE member_subscriptions SET status = 'suspended'
         WHERE id = $1 AND member_id = $2 AND gym_id = $3`,
        [metadata.subscription_id, metadata.member_id, metadata.gym_id]
      );

      logger.warn('Payment failed, subscription suspended', { transaction_id, provider, memberId: metadata.member_id });
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Webhook processing failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}
