import { Request, Response } from 'express';
import { query, getAdminClient } from '../config/database';
import { setTenantGymId } from '../config/tenantContext';
import { getPaymentGateway } from '../services/paymentFactory';
import logger from '../config/logger';

export interface CreatePaymentOrderInput {
  gym_id: string;
  plan_id?: string;
  cycle_type?: 'monthly' | 'yearly';
  return_url?: string;
  cancel_url?: string;
}

export async function createSubscriptionPayment(req: Request, res: Response): Promise<void> {
  const { gym_id, plan_id, cycle_type = 'monthly', return_url, cancel_url } = req.body as CreatePaymentOrderInput;

  if (!gym_id || !plan_id) {
    res.status(400).json({ error: 'gym_id and plan_id are required' });
    return;
  }

  const client = await getAdminClient();
  try {
    // 1. Fetch plan + gym
    const planResult = await client.query(`SELECT * FROM billing_plans WHERE id = $1 AND is_active = true`, [plan_id]);
    if (planResult.rows.length === 0) {
      await client.query('COMMIT');
      res.status(404).json({ error: 'Plan not found or inactive' });
      return;
    }
    const plan = planResult.rows[0];

    const gymResult = await client.query(`SELECT * FROM gyms WHERE id = $1`, [gym_id]);
    if (gymResult.rows.length === 0) {
      await client.query('COMMIT');
      res.status(404).json({ error: 'Gym not found' });
      return;
    }
    const gym = gymResult.rows[0];

    // 2. Determine amount
    const amount = cycle_type === 'yearly' && plan.price_yearly > 0 ? plan.price_yearly : plan.price_monthly;
    const currency = 'EGP';

    // 3. Call payment gateway
    const gateway = getPaymentGateway(gym.address_country || 'Egypt');
    const paymentResult = await gateway.charge(amount, currency, {
      gym_id,
      plan_id,
      cycle_type,
      gym_name: gym.name,
    });

    await client.query('COMMIT');

    if (!paymentResult.success) {
      res.status(402).json({ error: paymentResult.error || 'Payment initiation failed' });
      return;
    }

    // 4. Create pending invoice
    const now = new Date();
    const startDate = now.toISOString().split('T')[0];
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + (cycle_type === 'yearly' ? 12 : 1));
    const endDateStr = endDate.toISOString().split('T')[0];

    const invoiceResult = await client.query(
      `INSERT INTO billing_invoices (gym_id, plan_id, amount, status, period_start, period_end, payment_method, notes)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7)
       RETURNING *`,
      [gym_id, plan_id, amount, startDate, endDateStr, 'paymob', `Online subscription: ${plan.name} ${cycle_type}`]
    );

    await client.query('COMMIT');

    res.json({
      data: {
        transaction_id: paymentResult.transactionId,
        amount,
        currency,
        plan_name: plan.name,
        cycle_type,
        invoice_id: invoiceResult.rows[0].id,
        payment_url: `https://secure.paymob.com/payment/${paymentResult.transactionId}`,
        return_url: return_url || '/billing/success',
        cancel_url: cancel_url || '/billing/cancel',
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('createSubscriptionPayment failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
}

export async function handleSubscriptionWebhook(req: Request, res: Response): Promise<void> {
  const { provider, status, transaction_id, metadata } = req.body;

  if (!provider || !status || !transaction_id || !metadata?.gym_id) {
    res.status(400).json({ error: 'Invalid webhook payload' });
    return;
  }

  setTenantGymId(metadata.gym_id);

  try {
    // Idempotency
    try {
      await query(`INSERT INTO webhook_events (provider, transaction_id, payload) VALUES ($1, $2, $3)`, [provider, transaction_id, JSON.stringify(req.body)]);
    } catch (e: unknown) {
      if ((e as { code?: string }).code === '23505') {
        logger.info('Duplicate subscription webhook ignored', { transaction_id, provider });
        res.status(200).json({ received: true, duplicate: true });
        return;
      }
      throw e;
    }

    if (status === 'success' || status === 'paid') {
      // Find pending invoice for this transaction
      const invoiceResult = await query(
        `SELECT i.*, p.name AS plan_name, p.max_members, p.max_staff, p.features AS plan_features
         FROM billing_invoices i
         LEFT JOIN billing_plans p ON p.id = i.plan_id
         WHERE i.payment_method = $1 AND i.status = 'pending' AND i.gym_id = $2
           AND (i.notes LIKE $3 OR i.id = $4)
         ORDER BY i.created_at DESC LIMIT 1`,
        [provider, metadata.gym_id, `%${transaction_id}%`, metadata.invoice_id || '']
      );

      if (invoiceResult.rows.length > 0) {
        const invoice = invoiceResult.rows[0];

        // Update invoice to paid
        await query(
          `UPDATE billing_invoices SET status = 'paid', paid_at = NOW(), fawry_ref_number = $1 WHERE id = $2`,
          [transaction_id, invoice.id]
        );

        // Calculate new expiry
        const now = new Date();
        const startDate = now.toISOString().split('T')[0];
        const endDate = new Date(now);
        const months = invoice.period_end ? (new Date(invoice.period_end).getTime() - new Date(invoice.period_start).getTime()) / (1000 * 60 * 60 * 24 * 30) : 1;
        endDate.setMonth(endDate.getMonth() + Math.round(months));

        // Update gym subscription
        const planFeatures = Array.isArray(invoice.plan_features) ? invoice.plan_features : [];
        await query(
          `UPDATE gyms
           SET plan_id = $1,
               features = COALESCE($2, features),
               member_limit = COALESCE($3, member_limit),
               subscription_status = 'active',
               subscription_expires_at = $4,
               updated_at = NOW()
           WHERE id = $5`,
          [invoice.plan_id, JSON.stringify(planFeatures), invoice.max_members, endDate.toISOString().split('T')[0], metadata.gym_id]
        );

        await query(
          `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
           VALUES ($1, NULL, $2, $3)`,
          [metadata.gym_id, `Subscription renewed: ${invoice.plan_name} via ${provider} (${transaction_id})`, req.ip]
        );

        logger.info('Subscription auto-renewed via webhook', { transaction_id, provider, gym_id: metadata.gym_id, plan_id: invoice.plan_id });
      } else {
        logger.warn('Subscription webhook matched no pending invoice', { transaction_id, provider, gym_id: metadata.gym_id });
      }
    } else if (status === 'failed' || status === 'cancelled') {
      const invoiceResult = await query(
        `UPDATE billing_invoices SET status = 'cancelled' WHERE payment_method = $1 AND status = 'pending' AND gym_id = $2
         AND notes LIKE $3 RETURNING id`,
        [provider, metadata.gym_id, `%${transaction_id}%`]
      );
      if (invoiceResult.rows.length > 0) {
        await query(
          `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
           VALUES ($1, NULL, $2, $3)`,
          [metadata.gym_id, `Payment failed: ${transaction_id} via ${provider}`, req.ip]
        );
      }
      logger.warn('Subscription payment failed', { transaction_id, provider, gym_id: metadata.gym_id });
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Subscription webhook processing failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

export async function getGymSubscription(req: Request, res: Response): Promise<void> {
  const gymId = req.params.gymId || req.query.gym_id;
  if (!gymId || typeof gymId !== 'string') {
    res.status(400).json({ error: 'gym_id is required' });
    return;
  }

  try {
    const result = await query(
      `SELECT g.plan_id, g.features, g.member_limit, g.subscription_status, g.subscription_expires_at,
              p.name AS plan_name, p.name_ar, p.price_monthly, p.price_yearly, p.max_members, p.max_staff, p.features AS plan_features
       FROM gyms g
       LEFT JOIN billing_plans p ON p.id = g.plan_id
       WHERE g.id = $1`,
      [gymId]
    );
    await query('COMMIT');

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Gym not found' });
      return;
    }

    const sub = result.rows[0];
    const daysRemaining = sub.subscription_expires_at
      ? Math.ceil((new Date(sub.subscription_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    res.json({
      data: {
        ...sub,
        days_remaining: daysRemaining,
        is_expired: daysRemaining !== null && daysRemaining < 0,
      },
    });
  } catch (error) {
    await query('ROLLBACK').catch(() => {});
    logger.error('getGymSubscription failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
}
