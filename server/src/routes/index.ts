import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { authenticateAndIsolateTenant, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { authRateLimit, qrRateLimit } from '../middleware/rateLimit';

const photoStorage = multer.diskStorage({
  destination: path.resolve(__dirname, '../../uploads/members'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, jpeg, png, gif, webp) are allowed.'));
    }
  },
});
import {
  createPendingAction,
  processPendingAction,
  listPendingActions,
} from '../controllers/pendingActions';
import {
  verifyAndRegisterAttendance,
  getTodayAttendance,
  manualCheckIn,
  verifyPublicQrPass,
} from '../controllers/attendance';
import {
  bookFitnessClass,
  cancelClassBooking,
  getMyBookings,
  toggleMobileSubscriptionFreeze,
} from '../controllers/bookings';
import {
  listMembers,
  getMemberById,
  createMember,
  updateMember,
  blacklistMember,
  cancelSubscription,
} from '../controllers/members';
import {
  staffLogin,
  refreshAccessToken,
  staffLogout,
  createStaffAccount,
  forgotPassword,
  getAuthMe,
  resetPassword,
  listSessions,
  revokeSession,
  revokeAllOtherSessions,
} from '../controllers/auth';
import { listOffers } from '../controllers/offers';
import {
  loginSchema,
  qrAttendanceSchema,
  manualCheckinSchema,
  classBookingSchema,
  freezeSubscriptionSchema,
  pendingActionSchema,
  processPendingSchema,
  createMemberSchema,
  updateMemberSchema,
  blacklistMemberSchema,
  createStaffSchema,
  paginationSchema,
  createLeadSchema,
  updateLeadSchema,
  earnPointsSchema,
  redeemPointsSchema,
  createRewardSchema,
  sendNotificationSchema,
  createProductSchema,
  createPaymentSchema,
  createExpenseSchema,
  createStaffSchemaV2,
  createSaleSchema,
  createPurchaseSchema,
  createSupplierSchema,
  createDebtSchema,
  openCashboxSchema,
  createAnnouncementSchema,
  createPtPackageSchema,
  createPtSessionSchema,
  updateSettingsSchema,
  updateProductSchema,
  updateStaffSchema,
  closeCashboxSchema,
  payDebtSchema,
  completePtSessionSchema,
  registerPushSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  cancelSubscriptionSchema,
  sendBulkNotificationSchema,
  memberLoginSchema,
  createSubscriptionPaymentSchema,
  unregisterPushSchema,
} from '../validators/schemas';
import {
  listLeads, getLeadById, createLead, updateLead, deleteLead, getLeadStats,
} from '../controllers/crm';
import { getRetentionRate, getPeakHours, getRevenueForecast, getEnrollmentTrend, getRevenueBreakdown } from '../controllers/analytics';
import { getExpiringSoon, getInactiveMembers, getOverdueDebts } from '../controllers/dashboard';
import { handlePaymentWebhook } from '../controllers/webhooks';
import { webhookIdempotency } from '../middleware/webhookIdempotency';
import { verifyPaymentWebhookSignature } from '../middleware/webhookAuth';
import { planGuard } from '../middleware/planGuard';
import { createSubscriptionPayment, handleSubscriptionWebhook, getGymSubscription } from '../controllers/tenantBilling';
import {
  getPointsBalance, earnPoints, redeemPoints, listRewards, createReward, getPointsHistory,
} from '../controllers/loyalty';
import { getCustomer360, getMemberSearch } from '../controllers/customer360';
import {
  getMemberInsights, predictChurn, getWorkoutRecommendation,
} from '../controllers/aiCoachController';
import { sendNotification, sendBulkNotification, getWhatsappStatus, listGymNotifications, markGymNotificationRead } from '../controllers/notifications';
import {
  memberLogin, getMyProfile, getMyVisits, getMySubscription,
  getUpcomingClasses, getMyPoints, getMy360,
  registerPushToken, unregisterPushToken,
} from '../controllers/mobile';
import {
  listPayments, createPayment, listExpenses, createExpense, listExpenseCategories,
  listSales, createSale, listPurchases, createPurchase,
  listSuppliers, createSupplier,
  listDebts, createDebt, payDebt,
  listCashboxSessions, openCashbox, closeCashbox, getFinanceSummary,
} from '../controllers/finance';
import {
  completeStitchOrderHandler, listStitchOrdersHandler, getStitchOrderHandler,
} from '../controllers/stitch';
import {
  listProducts, getProduct, createProduct, updateProduct, deleteProduct,
} from '../controllers/products';
import {
  listStaff, getStaff, createStaff, updateStaff, deleteStaff,
  listTrainers,
  listShifts, clockIn, clockOut,
  listPayroll, processPayroll, getStaffAttendanceSummary,
} from '../controllers/staff';
import {
  listPtPackages, createPtPackage,
  listPtSessions, createPtSession, completePtSession,
} from '../controllers/training';
import {
  listAnnouncements, createAnnouncement,
  getSettings, updateSettings,
} from '../controllers/gym';
import { getSetupProgress } from '../controllers/setup';
import { listWorkflows, updateWorkflow, triggerWorkflow } from '../controllers/workflows';

const router = Router();

// ====================================================================
// HEALTH CHECK — Public (no auth)
// ====================================================================
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ====================================================================
// AUTH ROUTES — Public with rate limiting
// ====================================================================
router.post('/auth/login', authRateLimit, validate(loginSchema), staffLogin);
router.post('/auth/refresh', authRateLimit, validate(refreshTokenSchema), refreshAccessToken);
router.get('/auth/me', authenticateAndIsolateTenant, getAuthMe);
router.post('/auth/logout', staffLogout);
router.post('/auth/register', authRateLimit, validate(createStaffSchema), authenticateAndIsolateTenant, createStaffAccount);
router.post('/auth/forgot-password', authRateLimit, validate(forgotPasswordSchema), forgotPassword);
router.post('/auth/reset-password', authRateLimit, validate(resetPasswordSchema), resetPassword);

// ====================================================================
// PAYMENT WEBHOOKS — Public (signed by payment providers)
// ====================================================================
router.post('/api/webhooks/payments', verifyPaymentWebhookSignature, webhookIdempotency({ gateway: 'paymob' }), handlePaymentWebhook);

// ====================================================================
// WHATSAPP WEBHOOK — Public for incoming message status
// ====================================================================
router.post('/api/webhooks/whatsapp', (req, res) => {
  res.status(200).json({ received: true });
});

// ====================================================================
// PUBLIC QR PASS VERIFICATION — No JWT (QR scanner hardware)
// ====================================================================
router.post('/api/auth/verify-pass', qrRateLimit, verifyPublicQrPass);

// ====================================================================
// AUTHENTICATED ROUTES — All require valid JWT + Tenant Isolation
// ====================================================================
router.use('/api', authenticateAndIsolateTenant);

// ====================================================================
// MEMBERS
// ====================================================================
router.get('/api/members', requireRole('manager', 'receptionist', 'coach'), listMembers);
router.get('/api/members/:id', requireRole('manager', 'receptionist', 'coach'), getMemberById);
router.post('/api/members', requireRole('manager', 'receptionist'), planGuard({ checkMembers: true }), validate(createMemberSchema), createMember);
router.put('/api/members/:id', requireRole('manager', 'receptionist'), validate(updateMemberSchema), updateMember);
router.put('/api/members/:id/blacklist', requireRole('manager'), validate(blacklistMemberSchema), blacklistMember);
router.post('/api/subscriptions/:subscriptionId/cancel', requireRole('manager'), validate(cancelSubscriptionSchema), cancelSubscription);

// ====================================================================
// MEMBERSHIP OFFERS
// ====================================================================
router.get('/api/membership-offers', requireRole('manager', 'receptionist', 'coach'), listOffers);

// ====================================================================
// ATTENDANCE & QR CHECK-IN
// ====================================================================
router.post('/api/attendance/qr', qrRateLimit, requireRole('manager', 'receptionist'), validate(qrAttendanceSchema), verifyAndRegisterAttendance);
router.post('/api/attendance/manual', requireRole('manager', 'receptionist'), validate(manualCheckinSchema), manualCheckIn);
router.get('/api/attendance/today', requireRole('manager', 'receptionist', 'coach'), getTodayAttendance);

// ====================================================================
// PHOTO UPLOAD — Staff-accessible member photo upload
// ====================================================================
router.post('/api/upload/photo', requireRole('manager', 'receptionist'), (req, res) => {
  uploadPhoto.single('photo')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Upload failed.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded.' });
      return;
    }
    res.json({ data: { url: `/uploads/members/${req.file.filename}` } });
  });
});

// ====================================================================
// PENDING ACTIONS — Anti-Tampering Change Request System
// ====================================================================
router.post('/api/pending-actions', requireRole('manager', 'receptionist'), validate(pendingActionSchema), createPendingAction);
router.put('/api/pending-actions/process', requireRole('manager'), validate(processPendingSchema), processPendingAction);
router.get('/api/pending-actions', requireRole('manager'), listPendingActions);

// ====================================================================
// CLASS BOOKINGS — Mobile App Endpoints (Member Token)
// ====================================================================
router.post('/api/classes/book', requireRole('member'), planGuard({ requireFeatures: ['class_booking'] }), validate(classBookingSchema), bookFitnessClass);
router.put('/api/classes/cancel/:booking_id', requireRole('member'), cancelClassBooking);
router.get('/api/classes/my-bookings', requireRole('member'), getMyBookings);

// ====================================================================
// SUBSCRIPTION FREEZE — Mobile App Endpoint (Member Token)
// ====================================================================
router.post('/api/subscriptions/freeze', requireRole('member'), validate(freezeSubscriptionSchema), toggleMobileSubscriptionFreeze);

// ====================================================================
// CRM / LEAD MANAGEMENT
// ====================================================================
router.get('/api/crm/leads', requireRole('manager', 'receptionist'), listLeads);
router.get('/api/crm/leads/stats', requireRole('manager'), getLeadStats);
router.get('/api/crm/leads/:id', requireRole('manager', 'receptionist'), getLeadById);
router.post('/api/crm/leads', requireRole('manager', 'receptionist'), validate(createLeadSchema), createLead);
router.put('/api/crm/leads/:id', requireRole('manager', 'receptionist'), validate(updateLeadSchema), updateLead);
router.delete('/api/crm/leads/:id', requireRole('manager'), deleteLead);

// ====================================================================
// BI ANALYTICS
// ====================================================================
router.get('/api/analytics/retention-rate', requireRole('manager'), getRetentionRate);
router.get('/api/analytics/peak-hours', requireRole('manager'), getPeakHours);
router.get('/api/analytics/revenue-forecast', requireRole('manager'), getRevenueForecast);
router.get('/api/analytics/enrollment-trend', requireRole('manager'), getEnrollmentTrend);
router.get('/api/analytics/revenue-breakdown', requireRole('manager'), getRevenueBreakdown);

// ====================================================================
// MANAGER DASHBOARD — "needs your action" feeds (§24, read-only)
// ====================================================================
router.get('/api/dashboard/expiring-soon', requireRole('manager'), getExpiringSoon);
router.get('/api/dashboard/inactive-members', requireRole('manager'), getInactiveMembers);
router.get('/api/dashboard/overdue-debts', requireRole('manager'), getOverdueDebts);

// ====================================================================
// LOYALTY POINTS & REWARDS
// ====================================================================
router.get('/api/loyalty/points/:member_id', requireRole('manager', 'receptionist'), getPointsBalance);
router.post('/api/loyalty/earn', requireRole('manager', 'receptionist'), validate(earnPointsSchema), earnPoints);
router.post('/api/loyalty/redeem', requireRole('member'), validate(redeemPointsSchema), redeemPoints);
router.get('/api/loyalty/rewards', requireRole('manager', 'receptionist', 'coach', 'member'), listRewards);
router.post('/api/loyalty/rewards', requireRole('manager'), validate(createRewardSchema), createReward);
router.get('/api/loyalty/history/:member_id', requireRole('manager', 'receptionist'), getPointsHistory);

// ====================================================================
// CUSTOMER 360 — Unified Member View
// §32 fix: the static '/search' path must be registered BEFORE the
// '/:member_id' param route — express matches in order, so previously
// GET /api/customer360/search hit getCustomer360 with member_id="search"
// and 500'd ("invalid input syntax for type uuid").
// ====================================================================
router.get('/api/customer360/search', requireRole('manager', 'receptionist', 'coach'), getMemberSearch);
router.get('/api/customer360/:member_id', requireRole('manager', 'receptionist', 'coach'), getCustomer360);

// ====================================================================
// AI COACH — Insights & Recommendations
// ====================================================================
router.get('/api/ai-coach/insights/:member_id', requireRole('manager', 'coach'), getMemberInsights);
router.get('/api/ai-coach/churn-prediction', requireRole('manager'), predictChurn);
router.get('/api/ai-coach/workout/:member_id', requireRole('manager', 'coach', 'member'), getWorkoutRecommendation);

// ====================================================================
// WHATSAPP NOTIFICATIONS
// ====================================================================
router.post('/api/notifications/send', requireRole('manager'), validate(sendNotificationSchema), sendNotification);
router.post('/api/notifications/bulk', requireRole('manager'), validate(sendBulkNotificationSchema), sendBulkNotification);
router.get('/api/notifications/status', requireRole('manager'), getWhatsappStatus);
router.get('/api/notifications', requireRole('manager', 'receptionist', 'coach'), listGymNotifications);
router.patch('/api/notifications/:id/read', requireRole('manager', 'receptionist', 'coach'), markGymNotificationRead);

// ====================================================================

// ====================================================================
// MOBILE / MEMBER ENDPOINTS
// ====================================================================
router.post('/auth/member-login', authRateLimit, validate(memberLoginSchema), memberLogin);
router.get('/api/members/me', requireRole('member'), getMyProfile);
router.get('/api/attendance/my-visits', requireRole('member'), getMyVisits);
router.get('/api/subscriptions/my', requireRole('member'), getMySubscription);
router.get('/api/classes/upcoming', requireRole('member'), getUpcomingClasses);
router.get('/api/loyalty/my-points', requireRole('member'), getMyPoints);
router.get('/api/customer360/me', requireRole('member'), getMy360);
router.post('/api/push/register', requireRole('member'), validate(registerPushSchema), registerPushToken);
router.post('/api/push/unregister', requireRole('member'), validate(unregisterPushSchema), unregisterPushToken);

// ====================================================================
// PRODUCTS / INVENTORY
// ====================================================================
router.get('/api/products', requireRole('manager', 'receptionist', 'coach'), listProducts);
router.get('/api/products/:id', requireRole('manager', 'receptionist', 'coach'), getProduct);
router.post('/api/products', requireRole('manager'), planGuard({ requireFeatures: ['products'] }), validate(createProductSchema), createProduct);
router.put('/api/products/:id', requireRole('manager'), validate(updateProductSchema), updateProduct);
router.delete('/api/products/:id', requireRole('manager'), deleteProduct);

// ====================================================================
// FINANCE — Payments, Expenses, Sales, Purchases, Suppliers, Debts, Cashbox
// ====================================================================
router.get('/api/finance/payments', requireRole('manager'), listPayments);
router.post('/api/finance/payments', requireRole('manager'), validate(createPaymentSchema), createPayment);
router.get('/api/finance/expenses', requireRole('manager'), listExpenses);
router.post('/api/finance/expenses', requireRole('manager'), validate(createExpenseSchema), createExpense);
router.get('/api/finance/expense-categories', requireRole('manager'), listExpenseCategories);
router.get('/api/finance/sales', requireRole('manager'), listSales);
router.post('/api/finance/sales', requireRole('manager'), validate(createSaleSchema), createSale);
router.get('/api/finance/purchases', requireRole('manager'), listPurchases);
router.post('/api/finance/purchases', requireRole('manager'), planGuard({ requireFeatures: ['inventory'] }), validate(createPurchaseSchema), createPurchase);
router.get('/api/finance/suppliers', requireRole('manager'), listSuppliers);
router.post('/api/finance/suppliers', requireRole('manager'), validate(createSupplierSchema), createSupplier);
router.get('/api/finance/debts', requireRole('manager'), listDebts);
router.post('/api/finance/debts', requireRole('manager'), validate(createDebtSchema), createDebt);
router.post('/api/finance/debts/:id/pay', requireRole('manager'), validate(payDebtSchema), payDebt);
router.get('/api/finance/cashbox', requireRole('manager'), listCashboxSessions);
router.post('/api/finance/cashbox/open', requireRole('manager'), validate(openCashboxSchema), openCashbox);
router.post('/api/finance/cashbox/close', requireRole('manager'), validate(closeCashboxSchema), closeCashbox);
router.get('/api/finance/summary', requireRole('manager'), getFinanceSummary);

// ====================================================================
// TENANT BILLING — Subscription payments + webhooks
// ====================================================================
router.post('/api/billing/subscription/pay', requireRole('manager'), validate(createSubscriptionPaymentSchema), createSubscriptionPayment);
router.post('/api/billing/webhook/subscription', handleSubscriptionWebhook);
router.get('/api/billing/subscription', getGymSubscription);

// ====================================================================
// STAFF / USERS / TRAINERS / SHIFTS / HR
// ====================================================================
router.get('/api/staff', requireRole('manager'), listStaff);
router.get('/api/staff/:id', requireRole('manager'), getStaff);
router.post('/api/staff', requireRole('manager'), planGuard({ checkStaff: true }), validate(createStaffSchemaV2), createStaff);
router.put('/api/staff/:id', requireRole('manager'), validate(updateStaffSchema), updateStaff);
router.delete('/api/staff/:id', requireRole('manager'), deleteStaff);
router.get('/api/trainers', requireRole('manager', 'receptionist', 'coach'), listTrainers);
router.get('/api/staff/shifts', requireRole('manager'), listShifts);
router.post('/api/staff/clock-in', requireRole('manager', 'receptionist', 'coach'), clockIn);
router.post('/api/staff/clock-out', requireRole('manager', 'receptionist', 'coach'), clockOut);
router.get('/api/hr/payroll', requireRole('manager'), listPayroll);
router.post('/api/hr/payroll', requireRole('manager'), processPayroll);
router.get('/api/hr/staff-attendance', requireRole('manager'), getStaffAttendanceSummary);

// ====================================================================
// TRAINING — PT Packages & Sessions
// ====================================================================
router.get('/api/training/packages', requireRole('manager', 'coach'), listPtPackages);
router.post('/api/training/packages', requireRole('manager'), planGuard({ requireFeatures: ['training'] }), validate(createPtPackageSchema), createPtPackage);
router.get('/api/training/sessions', requireRole('manager', 'coach'), listPtSessions);
router.post('/api/training/sessions', requireRole('manager', 'coach'), validate(createPtSessionSchema), createPtSession);
router.put('/api/training/sessions/:id/complete', requireRole('manager', 'coach'), validate(completePtSessionSchema), completePtSession);

// ====================================================================
// GYM — Announcements & Settings
// ====================================================================
router.get('/api/announcements', requireRole('manager', 'receptionist', 'coach', 'member'), listAnnouncements);
router.post('/api/announcements', requireRole('manager'), validate(createAnnouncementSchema), createAnnouncement);
router.get('/api/settings', requireRole('manager'), getSettings);
router.put('/api/settings', requireRole('manager'), validate(updateSettingsSchema), updateSettings);

// ====================================================================
// SESSION MANAGEMENT — View & revoke active sessions
// ====================================================================
router.get('/api/auth/sessions', requireRole('manager', 'receptionist', 'coach'), listSessions);
router.delete('/api/auth/sessions/:jti', requireRole('manager', 'receptionist', 'coach'), revokeSession);
router.post('/api/auth/sessions/revoke-others', requireRole('manager', 'receptionist', 'coach'), revokeAllOtherSessions);

// ====================================================================
// SETUP — Onboarding progress check (single endpoint replaces 8 queries)
// ====================================================================
router.get('/api/setup/progress', requireRole('manager'), getSetupProgress);

// ====================================================================
// WORKFLOW DEFINITIONS — Automation rules per gym
// ====================================================================
router.get('/api/workflows', requireRole('manager'), listWorkflows);
router.put('/api/workflows/:id', requireRole('manager'), updateWorkflow);
router.post('/api/workflows/:id/trigger', requireRole('manager', 'receptionist'), triggerWorkflow);

// ====================================================================
// BILLING — Alias routes for billing engine (maps to finance endpoints)
// ====================================================================
router.get('/api/billing/transactions', requireRole('manager'), listPayments);
router.get('/api/billing/metrics', requireRole('manager'), getFinanceSummary);

// ====================================================================
// STITCH / TAILORING MODULE — Linked to Core Membership
//   - List/get orders are tenant-scoped (RLS on stitch_orders).
//   - Completing an order enforces the subscription guard and auto-creates
//     the POS order + financial income transaction + loyalty points.
// ====================================================================
router.get('/api/stitch', requireRole('manager', 'receptionist'), listStitchOrdersHandler);
router.get('/api/stitch/:id', requireRole('manager', 'receptionist'), getStitchOrderHandler);
router.post('/api/stitch/:id/complete', requireRole('manager'), completeStitchOrderHandler);

export default router;

