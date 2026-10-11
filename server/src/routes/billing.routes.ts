import { Router } from 'express';
import { authenticatePlatformAdmin, authorizePlatformAdminRoute } from '../middleware/platformAuth';
import { validate } from '../middleware/validate';

import {
  getBillingDashboard,
  createInvoiceHandler,
  getInvoiceHandler,
  listInvoicesHandler,
  updateInvoiceStatusHandler,
  createCouponHandler,
  listCouponsHandler,
  validateCouponHandler,
  toggleCouponHandler,
  getPaymentGatewaysHandler,
  updatePaymentGatewayHandler,
  getBillingReportsHandler,
  // Loyalty
  getLoyaltySettingsHandler,
  addPointsHandler,
  redeemPointsHandler,
  getTierForPointsHandler,
  getRewardsHandler,
  claimRewardHandler,
  // Campaigns
  createCampaignHandler,
  getCampaignsHandler,
  updateCampaignStatusHandler,
  // Broadcasts
  createBroadcastHandler,
  getBroadcastsHandler,
  // Referrals
  createReferralHandler,
  getReferralsHandler,
  completeReferralHandler,
  // Support Tickets
  createTicketHandler,
  getTicketHandler,
  getTicketsHandler,
  assignTicketHandler,
  updateTicketStatusHandler as updateTicketStatusSupportHandler,
  addTicketMessageHandler,
} from '../controllers/billing.controller';

import {
  createInvoiceSchema,
  updateInvoiceSchema,
  invoiceFilterSchema,
  createCouponSchema,
  applyCouponSchema,
  couponFilterSchema,
  createCampaignSchema,
  createBroadcastSchema,
  createReferralSchema,
  createTicketSchema,
  addTicketMessageSchema,
  assignTicketSchema,
  resolveTicketSchema,
  ticketFilterSchema,
} from '../validators/billing.validators';

const router = Router();

// All routes require platform admin authentication
router.use(authenticatePlatformAdmin);
router.use(authorizePlatformAdminRoute);

// ====================================================================
// BILLING ROUTES
// ====================================================================
router.get('/billing/dashboard', getBillingDashboard);
router.get('/billing/reports', getBillingReportsHandler);

// Invoices
router.post('/billing/invoices', validate(createInvoiceSchema), createInvoiceHandler);
router.get('/billing/invoices', validate(invoiceFilterSchema), listInvoicesHandler);
router.get('/billing/invoices/:id', getInvoiceHandler);
router.patch('/billing/invoices/:id', validate(updateInvoiceSchema), updateInvoiceStatusHandler);

// Coupons
router.post('/billing/coupons', validate(createCouponSchema), createCouponHandler);
router.get('/billing/coupons', validate(couponFilterSchema), listCouponsHandler);
router.post('/billing/coupons/validate', validate(applyCouponSchema), validateCouponHandler);
router.patch('/billing/coupons/:id/toggle', toggleCouponHandler);

// Payment Gateways
router.get('/billing/gateways', getPaymentGatewaysHandler);
router.patch('/billing/gateways/:id', updatePaymentGatewayHandler);

// ====================================================================
// LOYALTY ROUTES
// ====================================================================
router.get('/loyalty/settings', getLoyaltySettingsHandler);
router.post('/loyalty/add-points', addPointsHandler);
router.post('/loyalty/redeem-points', redeemPointsHandler);
router.post('/loyalty/tier-for-points', getTierForPointsHandler);
router.get('/loyalty/rewards', getRewardsHandler);
router.post('/loyalty/claim-reward', claimRewardHandler);

// ====================================================================
// MARKETING ROUTES
// ====================================================================

// Campaigns
router.post('/marketing/campaigns', validate(createCampaignSchema), createCampaignHandler);
router.get('/marketing/campaigns', getCampaignsHandler);
router.patch('/marketing/campaigns/:id/status', updateCampaignStatusHandler);

// Broadcasts
router.post('/marketing/broadcasts', validate(createBroadcastSchema), createBroadcastHandler);
router.get('/marketing/broadcasts', getBroadcastsHandler);

// Referrals
router.post('/marketing/referrals', validate(createReferralSchema), createReferralHandler);
router.get('/marketing/referrals', getReferralsHandler);
router.post('/marketing/referrals/:id/complete', completeReferralHandler);

// ====================================================================
// SUPPORT TICKETS ROUTES
// ====================================================================
router.post('/support/tickets', validate(createTicketSchema), createTicketHandler);
router.get('/support/tickets', getTicketsHandler);
router.get('/support/tickets/:id', getTicketHandler);
router.post('/support/tickets/:id/assign', validate(assignTicketSchema), assignTicketHandler);
router.patch('/support/tickets/:id/status', updateTicketStatusSupportHandler);
router.post('/support/tickets/:id/messages', validate(addTicketMessageSchema), addTicketMessageHandler);

export default router;

