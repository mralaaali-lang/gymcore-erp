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
  checkOutAttendance, // §34ح
  lookupMembersForCheckIn, // §35ب
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
  getMemberStats, // §34ح
  getMemberById,
  createMember,
  updateMember,
  blacklistMember,
  resetMemberPin,
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
import { listOffers, listAllOffers, createOffer, updateOffer, deleteOffer } from '../controllers/offers';
import { createOfferSchema, updateOfferSchema, createSportSchema, updateSportSchema, createSubscriptionSchema, updateSubscriptionSchema, createPtEnrollmentSchema } from '../validators/schemas';
import { listSports, createSport, updateSport, deleteSport } from '../controllers/sports';
import { listQuickSessions, createQuickSession } from '../controllers/quickSessions';
import {
  listPtEnrollments, createPtEnrollment, consumePtSession, cancelPtEnrollment, ptReport,
} from '../controllers/privateTraining';
import {
  listLeaves, requestLeave, decideLeave, leaveBalances,
  listAdjustments, createAdjustment, deleteAdjustment, repayAdvance,
  generatePayroll, getPayroll, approvePayroll, payPayroll, deletePayrollRun,
  listContracts, createContract, deleteContract,
  getHrAttendance, saveHrAttendance, selfCheckin,
} from '../controllers/hr';
import {
  createLeaveSchema, decideLeaveSchema, createAdjustmentSchema, repayAdvanceSchema,
  generatePayrollSchema, createHrContractSchema, saveAttendanceSchema, selfCheckinSchema,
} from '../validators/schemas';
import { listSubscriptions, createSubscription, updateSubscription } from '../controllers/subscriptions';
import {
  loginSchema,
  qrAttendanceSchema,
  manualCheckinSchema,
  classBookingSchema, createFitnessClassSchema, updateFitnessClassSchema,
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
  createRefundSchema,
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
import { getRetentionRate, getPeakHours, getRevenueForecast, getEnrollmentTrend, getRevenueBreakdown, getBusinessMetrics, getEngagement, getMarketingFunnel, getGymReferrals, getReportsOverview, getMembersReport, getFinancialReport, getAttendanceReport, getSubscriptionsReport, getAbsentReport, getEmployeeSalesReport } from '../controllers/analytics';
// §41 — trainer daily progress logs (table: trainer_progress_logs, migration 069)
import {
  getTodayProgress, getProgressHistory, saveProgressLog, updateProgressLog, deleteProgressLog,
} from '../controllers/trainerProgress';
import { getExpiringSoon, getInactiveMembers, getOverdueDebts, getNavBadges, getAlertsCenter } from '../controllers/dashboard';
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
  getCashbook, listSessionLedger, listMovements, createRefund, getShiftReport,
} from '../controllers/finance';
// §34ج — الاستيراد الحقيقي (CSV) لستة كيانات
import { importData } from '../controllers/importData';
import {
  completeStitchOrderHandler, listStitchOrdersHandler, getStitchOrderHandler,
} from '../controllers/stitch';
import {
  listProducts, getProduct, createProduct, updateProduct, deleteProduct,
} from '../controllers/products';
// §37ب — جدول الحصص الحقيقي للإدارة (fitness_classes CRUD)
import {
  listClasses, createClass, updateClass, deleteClass,
} from '../controllers/classes';
import {
  listStaff, getStaff, createStaff, updateStaff, deleteStaff,
  listTrainers, listCoachesSummary,
  listShifts, clockIn, clockOut, bulkClockInCoaches, updateShift,
  listCoachAttendance, coachAttendanceReport,
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
import { resetGym } from '../controllers/gymReset';
import { getSetupProgress } from '../controllers/setup';
import { getPublicBranding } from '../controllers/branding';
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
// PUBLIC BRANDING — footer/app-name/logo only (no auth: display fields).
// ====================================================================
router.get('/api/branding-public', getPublicBranding);

// ====================================================================
// AUTHENTICATED ROUTES — All require valid JWT + Tenant Isolation
// ====================================================================
router.use('/api', authenticateAndIsolateTenant);

// ====================================================================
// MEMBERS
// ====================================================================
router.get('/api/members', requireRole('manager', 'receptionist', 'coach'), listMembers);
// §34ح — stats cards; registered BEFORE /:id so 'stats' is never treated as a member id.
router.get('/api/members/stats', requireRole('manager', 'receptionist'), getMemberStats);
router.get('/api/members/:id', requireRole('manager', 'receptionist', 'coach'), getMemberById);
router.post('/api/members', requireRole('manager', 'receptionist'), planGuard({ checkMembers: true }), validate(createMemberSchema), createMember);
router.put('/api/members/:id', requireRole('manager', 'receptionist'), validate(updateMemberSchema), updateMember);
router.put('/api/members/:id/blacklist', requireRole('manager'), validate(blacklistMemberSchema), blacklistMember);
// رمز الدخول غير قابل للاسترجاع (هاش فقط) — التوليد من جديد هو الطريق الصادق الوحيد.
router.post('/api/members/:id/pin-reset', requireRole('manager'), resetMemberPin);
// §34ج — استيراد CSV الحقيقي (tabs/Settings→MigrationTab) — كل صف يُكتب فعلًا
// أو يُرفض برسالة صادقة، بلا أي توست وهمي.
router.post('/api/import/:type', requireRole('manager'), importData);
router.post('/api/subscriptions/:subscriptionId/cancel', requireRole('manager'), validate(cancelSubscriptionSchema), cancelSubscription);
// §34ي — صفحة الاشتراكات: قائمة مفلترة + إحصائيات من نفس الصفوف، وإنشاء
// اشتراك يولّد دفعة ودينًا عند الجزئي/الآجل (كل الحسابات سيرفرية).
router.get('/api/subscriptions', requireRole('manager'), listSubscriptions);
router.post('/api/subscriptions', requireRole('manager'), validate(createSubscriptionSchema), createSubscription);
// تعديل بيانات التعيين فقط (رياضة/مدرب/أيام) — بلا أثر مالي، والملغي خارج النطاق.
router.put('/api/subscriptions/:id', requireRole('manager'), validate(updateSubscriptionSchema), updateSubscription);

// ====================================================================
// MEMBERSHIP OFFERS
// ====================================================================
router.get('/api/membership-offers', requireRole('manager', 'receptionist', 'coach'), listOffers);
// §33ب — offers are the single source of truth for plans: manager CRUD here,
// and the only honest lifecycle is deactivate (subscriptions reference rows).
router.get('/api/membership-offers/manage', requireRole('manager'), listAllOffers);
router.post('/api/membership-offers', requireRole('manager'), validate(createOfferSchema), createOffer);
router.put('/api/membership-offers/:id', requireRole('manager'), validate(updateOfferSchema), updateOffer);
router.delete('/api/membership-offers/:id', requireRole('manager'), deleteOffer);
router.get('/api/sports', requireRole('manager'), listSports);
router.post('/api/sports', requireRole('manager'), validate(createSportSchema), createSport);
router.put('/api/sports/:id', requireRole('manager'), validate(updateSportSchema), updateSport);
router.delete('/api/sports/:id', requireRole('manager'), deleteSport);
router.get('/api/quick-sessions', requireRole('manager', 'receptionist'), listQuickSessions);
router.post('/api/quick-sessions', requireRole('manager', 'receptionist'), createQuickSession);
router.get('/api/pt-enrollments', requireRole('manager'), listPtEnrollments);
router.post('/api/pt-enrollments', requireRole('manager'), validate(createPtEnrollmentSchema), createPtEnrollment);
router.post('/api/pt-enrollments/:id/consume', requireRole('manager'), consumePtSession);
router.post('/api/pt-enrollments/:id/cancel', requireRole('manager'), cancelPtEnrollment);
router.get('/api/pt-enrollments/report', requireRole('manager'), ptReport);

// ====================================================================
// HR — شئون الموظفين (manager only; self-checkin also receptionist)
// ====================================================================
router.get('/api/hr/leaves', requireRole('manager'), listLeaves);
router.post('/api/hr/leaves', requireRole('manager'), validate(createLeaveSchema), requestLeave);
router.post('/api/hr/leaves/:id/decision', requireRole('manager'), validate(decideLeaveSchema), decideLeave);
router.get('/api/hr/leave-balances', requireRole('manager'), leaveBalances);
router.get('/api/hr/adjustments', requireRole('manager'), listAdjustments);
router.post('/api/hr/adjustments', requireRole('manager'), validate(createAdjustmentSchema), createAdjustment);
router.delete('/api/hr/adjustments/:id', requireRole('manager'), deleteAdjustment);
router.post('/api/hr/adjustments/:id/repay', requireRole('manager'), validate(repayAdvanceSchema), repayAdvance);
router.post('/api/hr/payroll/generate', requireRole('manager'), validate(generatePayrollSchema), generatePayroll);
router.get('/api/hr/payroll', requireRole('manager'), getPayroll);
router.post('/api/hr/payroll/:id/approve', requireRole('manager'), approvePayroll);
router.post('/api/hr/payroll/:id/pay', requireRole('manager'), payPayroll);
router.delete('/api/hr/payroll/:id', requireRole('manager'), deletePayrollRun);
router.get('/api/hr/contracts', requireRole('manager'), listContracts);
router.post('/api/hr/contracts', requireRole('manager'), validate(createHrContractSchema), createContract);
router.delete('/api/hr/contracts/:id', requireRole('manager'), deleteContract);
router.get('/api/hr/attendance', requireRole('manager'), getHrAttendance);
router.post('/api/hr/attendance', requireRole('manager'), validate(saveAttendanceSchema), saveHrAttendance);
router.post('/api/staff/self-checkin', requireRole('manager', 'receptionist'), validate(selfCheckinSchema), selfCheckin);
// ====================================================================
// ATTENDANCE & QR CHECK-IN
// ====================================================================
router.post('/api/attendance/qr', qrRateLimit, requireRole('manager', 'receptionist'), validate(qrAttendanceSchema), verifyAndRegisterAttendance);
router.post('/api/attendance/manual', requireRole('manager', 'receptionist'), validate(manualCheckinSchema), manualCheckIn);
// §35ب — unified check-in field lookup (name / phone / member UUID).
router.get('/api/attendance/lookup', requireRole('manager', 'receptionist'), lookupMembersForCheckIn);
router.get('/api/attendance/today', requireRole('manager', 'receptionist', 'coach'), getTodayAttendance);
// §34ح — manual check-out of an open session (front desk button).
router.post('/api/attendance/checkout', requireRole('manager', 'receptionist'), checkOutAttendance);

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

// §37ب — إدارة الجدول: القراءة للمدير/الاستقبال/المدرب، والكتابة للمدير فقط.
router.get('/api/classes', requireRole('manager', 'receptionist', 'coach'), listClasses);
router.post('/api/classes', requireRole('manager'), validate(createFitnessClassSchema), createClass);
router.put('/api/classes/:id', requireRole('manager'), validate(updateFitnessClassSchema), updateClass);
router.delete('/api/classes/:id', requireRole('manager'), deleteClass);

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
router.get('/api/analytics/business-metrics', requireRole('manager'), getBusinessMetrics); // §34أ
router.get('/api/analytics/engagement', requireRole('manager'), getEngagement); // §34ب
router.get('/api/analytics/marketing-funnel', requireRole('manager'), getMarketingFunnel); // §34ت
router.get('/api/marketing/referrals', requireRole('manager'), getGymReferrals); // §40-M5 — real gym-scoped referrals
router.get('/api/reports/overview', requireRole('manager'), getReportsOverview);
router.get('/api/reports/members', requireRole('manager'), getMembersReport);
router.get('/api/reports/financial', requireRole('manager'), getFinancialReport);
router.get('/api/reports/attendance', requireRole('manager'), getAttendanceReport);
router.get('/api/reports/subscriptions', requireRole('manager'), getSubscriptionsReport);
router.get('/api/reports/absent', requireRole('manager'), getAbsentReport);
router.get('/api/reports/employee-sales', requireRole('manager'), getEmployeeSalesReport);

// ====================================================================
// MANAGER DASHBOARD — "needs your action" feeds (§24, read-only)
// ====================================================================
router.get('/api/dashboard/expiring-soon', requireRole('manager'), getExpiringSoon);
router.get('/api/dashboard/inactive-members', requireRole('manager'), getInactiveMembers);
router.get('/api/dashboard/overdue-debts', requireRole('manager'), getOverdueDebts);
router.get('/api/nav/badges', requireRole('manager', 'receptionist'), getNavBadges); // §35أ
router.get('/api/notifications/center', requireRole('manager'), getAlertsCenter);

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
router.get('/api/finance/cashbox/:id/ledger', requireRole('manager'), listSessionLedger); // §34ث
router.get('/api/finance/cashbox/:id/report', requireRole('manager'), getShiftReport);
router.get('/api/finance/cashbook', requireRole('manager'), getCashbook); // §34ث
router.get('/api/finance/movements', requireRole('manager'), listMovements);
router.post('/api/finance/refunds', requireRole('manager'), validate(createRefundSchema), createRefund);
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
router.get('/api/staff/coaches/summary', requireRole('manager'), listCoachesSummary);
router.get('/api/staff/shifts', requireRole('manager'), listShifts);
router.post('/api/staff/clock-in', requireRole('manager', 'receptionist', 'coach'), clockIn);
router.post('/api/staff/clock-in-bulk', requireRole('manager'), bulkClockInCoaches);
router.put('/api/staff/shifts/:id', requireRole('manager'), updateShift);
router.get('/api/staff/coaches/attendance', requireRole('manager'), listCoachAttendance);
router.get('/api/staff/coaches/attendance-report', requireRole('manager'), coachAttendanceReport);
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
// TRAINER PROGRESS — daily logs (§41, migration 069)
// coach: own rows only; manager: read anyone in the gym (trainer_id param).
// ====================================================================
router.get('/api/trainer-progress/today', requireRole('manager', 'coach'), getTodayProgress);
router.get('/api/trainer-progress/history', requireRole('manager', 'coach'), getProgressHistory);
router.post('/api/trainer-progress', requireRole('manager', 'coach'), saveProgressLog);
router.put('/api/trainer-progress/:id', requireRole('manager', 'coach'), updateProgressLog);
router.delete('/api/trainer-progress/:id', requireRole('manager', 'coach'), deleteProgressLog);

// ====================================================================
// GYM — Announcements & Settings
// ====================================================================
router.get('/api/announcements', requireRole('manager', 'receptionist', 'coach', 'member'), listAnnouncements);
router.post('/api/announcements', requireRole('manager'), validate(createAnnouncementSchema), createAnnouncement);
router.get('/api/settings', requireRole('manager'), getSettings);
router.put('/api/settings', requireRole('manager'), validate(updateSettingsSchema), updateSettings);
router.post('/api/gym/reset', requireRole('manager'), resetGym);

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

