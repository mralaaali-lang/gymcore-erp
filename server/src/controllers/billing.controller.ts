/**
 * billing.controller.ts — Billing, invoice, loyalty, marketing & support controllers
 * Endpoints: /platform/billing/*, /platform/loyalty/*, /platform/marketing/*, /platform/support/*
 */

import { Request, Response } from 'express';
import { getAdminClient } from '../config/database';
import logger from '../config/logger';
import * as Sentry from '@sentry/node';

// ─── Billing Services ──────────────────────────────────────────────
import {
  createInvoice,
  getInvoiceById,
  getInvoices,
  updateInvoiceStatus,
  getDashboardStats,
} from '../services/billing.service';

import {
  createCoupon,
  validateCoupon,
  getCoupons,
  toggleCoupon,
} from '../services/coupon.service';

// ─── Loyalty Services ─────────────────────────────────────────────
import {
  getLoyaltySettings,
  getOrCreateAccount,
  addPoints as addPointsToAccount,
  redeemPoints as redeemPointsFromAccount,
  getTierForPoints,
  getRewards,
  claimReward,
} from '../services/loyalty.service';

// ─── Marketing Services ────────────────────────────────────────────
import {
  createCampaign,
  getCampaigns,
  updateCampaignStatus,
  createBroadcast,
  getBroadcasts,
  createReferral,
  getReferrals,
  completeReferral,
} from '../services/marketing.service';

// ─── Support Services ──────────────────────────────────────────────
import {
  createTicket,
  getTickets,
  getTicket,
  assignTicket,
  updateTicketStatus as updateSupportTicketStatus,
  addTicketMessage,
} from '../services/support.service';

// ─── Zod Validators ────────────────────────────────────────────────
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  invoiceFilterSchema,
  createCouponSchema,
  applyCouponSchema,
  couponFilterSchema,
} from '../validators/billing.validators';

/** Safely extract error message from unknown error type */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ====================================================================
// DASHBOARD
// ====================================================================

export const getBillingDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const gymId = (req as any).gymId;
    const stats = await getDashboardStats(gymId);
    res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('Billing dashboard error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ====================================================================
// INVOICES
// ====================================================================

export const createInvoiceHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = createInvoiceSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }
    // Convert Date objects from Zod transforms to ISO strings for the service
    const raw = parseResult.data;
    const invoiceInput = {
      ...raw,
      billing_period_start: raw.billing_period_start instanceof Date ? raw.billing_period_start.toISOString() : raw.billing_period_start,
      billing_period_end: raw.billing_period_end instanceof Date ? raw.billing_period_end.toISOString() : raw.billing_period_end,
      due_date: raw.due_date instanceof Date ? raw.due_date.toISOString() : raw.due_date,
    };
    const invoice = await createInvoice(invoiceInput as any);
    res.status(201).json({ success: true, data: invoice });
  } catch (err) {
    logger.error('Create invoice error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
};

export const getInvoiceHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const invoice = await getInvoiceById(id);
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }
    res.json({ success: true, data: invoice });
  } catch (err) {
    logger.error('Get invoice error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listInvoicesHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = invoiceFilterSchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }
    const { gym_id, status, from_date, to_date, page, limit } = parseResult.data;
    const result = await getInvoices({
      gym_id: gym_id as string | undefined,
      status,
      from_date: from_date as string | undefined,
      to_date: to_date as string | undefined,
      page,
      limit,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('List invoices error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateInvoiceStatusHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const parseResult = updateInvoiceSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }
    const { status, paid_amount, payment_method, payment_reference } = parseResult.data;
    const invoice = await updateInvoiceStatus(id, status as string, paid_amount, payment_method, payment_reference);
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }
    res.json({ success: true, data: invoice });
  } catch (err) {
    logger.error('Update invoice error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ====================================================================
// COUPONS
// ====================================================================

export const createCouponHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = createCouponSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }
    const coupon = await createCoupon(parseResult.data);
    res.status(201).json({ success: true, data: coupon });
  } catch (err) {
    logger.error('Create coupon error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Failed to create coupon' });
  }
};

export const listCouponsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = couponFilterSchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }
    const { gym_id, page, limit } = parseResult.data;
    const result = await getCoupons(gym_id as string | undefined, page, limit);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('List coupons error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const validateCouponHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = applyCouponSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }
    const { code, gym_id, order_amount } = parseResult.data;
    const result = await validateCoupon(code, gym_id as string | undefined, order_amount);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Validate coupon error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const toggleCouponHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const coupon = await toggleCoupon(id);
    if (!coupon) {
      res.status(404).json({ error: 'Coupon not found' });
      return;
    }
    res.json({ success: true, data: coupon });
  } catch (err) {
    logger.error('Toggle coupon error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ====================================================================
// PAYMENT GATEWAYS
// ====================================================================

export const getPaymentGatewaysHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminClient = await getAdminClient();
    const result = await adminClient.query('SELECT * FROM payment_gateways ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('Get payment gateways error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updatePaymentGatewayHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { is_enabled, is_test_mode, api_key_test, api_key_production, webhook_secret, fee_percentage, fixed_fee } = req.body;

    const adminClient = await getAdminClient();
    const result = await adminClient.query(
      `UPDATE payment_gateways
       SET is_enabled = COALESCE($2, is_enabled),
           is_test_mode = COALESCE($3, is_test_mode),
           api_key_test = COALESCE($4, api_key_test),
           api_key_production = COALESCE($5, api_key_production),
           webhook_secret = COALESCE($6, webhook_secret),
           fee_percentage = COALESCE($7, fee_percentage),
           fixed_fee = COALESCE($8, fixed_fee),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [id, is_enabled, is_test_mode, api_key_test, api_key_production, webhook_secret, fee_percentage, fixed_fee]
    );
    await adminClient.query('COMMIT');
    adminClient.release();

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Payment gateway not found' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Update payment gateway error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ====================================================================
// REPORTS
// ====================================================================

export const getBillingReportsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { from_date, to_date, gym_id } = req.query;
    const stats = await getDashboardStats(gym_id as string | undefined);
    res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('Billing reports error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ====================================================================
// LOYALTY
// ====================================================================

export const getLoyaltySettingsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const gym_id = req.query.gym_id as string | undefined;
    const settings = await getLoyaltySettings(gym_id);
    res.json({ success: true, data: settings });
  } catch (err) {
    logger.error('Get loyalty settings error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const addPointsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { account_id, points, description, reference_type, reference_id } = req.body;
    if (!account_id || !points) {
      res.status(400).json({ error: 'account_id and points are required' });
      return;
    }
    const result = await addPointsToAccount(account_id, points, description, reference_type, reference_id);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Add points error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const redeemPointsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { account_id, points, description, reward_id } = req.body;
    if (!account_id || !points) {
      res.status(400).json({ error: 'account_id and points are required' });
      return;
    }
    const result = await redeemPointsFromAccount(account_id, points, description, 'reward', reward_id);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Redeem points error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getTierForPointsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { points } = req.body;
    if (points === undefined) {
      res.status(400).json({ error: 'points is required' });
      return;
    }
    const result = await getTierForPoints(points);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Get tier for points error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getRewardsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const gym_id = (req.query.gym_id || req.body.gym_id) as string | undefined;
    if (!gym_id) {
      res.status(400).json({ error: 'gym_id is required' });
      return;
    }
    const result = await getRewards(gym_id);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Get rewards error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const claimRewardHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { account_id, reward_id, gym_id } = req.body;
    if (!account_id || !reward_id || !gym_id) {
      res.status(400).json({ error: 'account_id, reward_id and gym_id are required' });
      return;
    }
    const result = await claimReward(account_id, reward_id, gym_id);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Claim reward error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ====================================================================
// CAMPAIGNS
// ====================================================================

export const createCampaignHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, name_ar, type, gym_id, platform_wide, budget, target_audience, start_date, end_date } = req.body;
    if (!name || !type) {
      res.status(400).json({ error: 'name and type are required' });
      return;
    }
    const campaign = await createCampaign({ name, name_ar, type, gym_id, platform_wide, budget, target_audience, start_date, end_date });
    res.status(201).json({ success: true, data: campaign });
  } catch (err) {
    logger.error('Create campaign error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
};

export const getCampaignsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { gym_id, status, type, page, limit } = req.query;
    const result = await getCampaigns({
      gym_id: gym_id as string | undefined,
      status: status as string | undefined,
      type: type as string | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('List campaigns error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateCampaignStatusHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) {
      res.status(400).json({ error: 'status is required' });
      return;
    }
    const campaign = await updateCampaignStatus(id, status);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    res.json({ success: true, data: campaign });
  } catch (err) {
    logger.error('Update campaign error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ====================================================================
// BROADCASTS
// ====================================================================

export const createBroadcastHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaign_id, subject, content, target_type, target_filter, scheduled_at } = req.body;
    if (!subject || !content || !target_type) {
      res.status(400).json({ error: 'subject, content and target_type are required' });
      return;
    }
    const broadcast = await createBroadcast({ campaign_id, subject, content, target_type, target_filter, scheduled_at });
    res.status(201).json({ success: true, data: broadcast });
  } catch (err) {
    logger.error('Create broadcast error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Failed to create broadcast' });
  }
};

export const getBroadcastsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { campaign_id, status, page, limit } = req.query;
    const result = await getBroadcasts({
      campaign_id: campaign_id as string | undefined,
      status: status as string | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('List broadcasts error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ====================================================================
// REFERRALS
// ====================================================================

export const createReferralHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { referrer_gym_id, referred_member_id, referrer_member_id, referral_code, campaign_id } = req.body;
    if (!referrer_gym_id || !referred_member_id || !referral_code) {
      res.status(400).json({ error: 'referrer_gym_id, referred_member_id and referral_code are required' });
      return;
    }
    const referral = await createReferral({ referrer_gym_id, referred_member_id, referrer_member_id, referral_code, campaign_id });
    res.status(201).json({ success: true, data: referral });
  } catch (err) {
    logger.error('Create referral error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Failed to create referral' });
  }
};

export const getReferralsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { referrer_gym_id, referred_member_id, status, page, limit } = req.query;
    const result = await getReferrals({
      referrer_gym_id: referrer_gym_id as string | undefined,
      referred_member_id: referred_member_id as string | undefined,
      status: status as string | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Get referrals error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const completeReferralHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await completeReferral(id);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Complete referral error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ====================================================================
// SUPPORT TICKETS
// ====================================================================

export const createTicketHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { gym_id, member_id, subject, description, category, priority } = req.body;
    if (!subject || !description) {
      res.status(400).json({ error: 'subject and description are required' });
      return;
    }
    const ticket = await createTicket({ gym_id, member_id, subject, description, category, priority });
    res.status(201).json({ success: true, data: ticket });
  } catch (err) {
    logger.error('Create ticket error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
};

export const getTicketsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { gym_id, status, priority, category, assigned_to, page, limit } = req.query;
    const result = await getTickets({
      gym_id: gym_id as string | undefined,
      status: status as string | undefined,
      priority: priority as string | undefined,
      category: category as string | undefined,
      assigned_to: assigned_to as string | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('List tickets error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getTicketHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { ticket, messages } = await getTicket(id);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    res.json({ success: true, data: { ticket, messages } });
  } catch (err) {
    logger.error('Get ticket error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const assignTicketHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { assigned_to } = req.body;
    if (!assigned_to) {
      res.status(400).json({ error: 'assigned_to is required' });
      return;
    }
    const ticket = await assignTicket(id, assigned_to);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    res.json({ success: true, data: ticket });
  } catch (err) {
    logger.error('Assign ticket error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateTicketStatusHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, resolution } = req.body;
    if (!status) {
      res.status(400).json({ error: 'status is required' });
      return;
    }
    const ticket = await updateSupportTicketStatus(id, status, resolution);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    res.json({ success: true, data: ticket });
  } catch (err) {
    logger.error('Update ticket status error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const addTicketMessageHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { sender_type, sender_id, content, is_internal } = req.body;
    if (!sender_type || !content) {
      res.status(400).json({ error: 'sender_type and content are required' });
      return;
    }
    const message = await addTicketMessage({
      ticket_id: id,
      sender_type,
      sender_id,
      content,
      is_internal,
    });
    res.status(201).json({ success: true, data: message });
  } catch (err) {
    logger.error('Add ticket message error:', { error: getErrorMessage(err) });
    Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

