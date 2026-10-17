import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { authRateLimit } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { authenticatePlatformAdmin, authorizePlatformAdminRoute } from '../middleware/platformAuth';
import { csrfProtection, csrfTokenHandler } from '../middleware/csrf';
// Auth functions
import {
  platformAdminLogin, platformRefreshToken, platformForgotPassword, platformResetPassword,
  platformLogout,
} from '../controllers/platformAdmin';
// Gym management
import {
  createGym, listGyms, getGym, setGymActive, updateGymSubscription,
  updateGymFull, deleteGym, impersonateGym, checkSubdomainAvailability,
  getGymSettings, updateGymSettings,
} from '../controllers/platformGyms';
// Platform admin CRUD
import {
  listPlatformAdmins, createPlatformAdmin, updatePlatformAdmin, deletePlatformAdmin,
} from '../controllers/platformAdmins';
// Security center
import {
  getSecuritySettings, updateSecuritySettings, getSecurityOverview,
  listPlatformAdminSessions, revokePlatformAdminSession,
  getFeatureFlags, updateFeatureFlags,
  setup2FA, verify2FA, disable2FA,
} from '../controllers/platformSecurity';
// Billing
import {
  listBillingPlans, createBillingPlan, updateBillingPlan, deleteBillingPlan,
  setPlanDiscount, togglePlanDiscount, deletePlanDiscount,
  listInvoices, getBillingSummary, initiateFawryPayment,
  createCustomPlan, listCustomPlans,
  setTrialPeriod, listTrials,
  setAutoUpgradeRule, listAutoUpgradeRules, deleteAutoUpgradeRule,
} from '../controllers/platformBilling';
// §36 Units & addons
import {
  listAddons, createAddon, updateAddon, deleteAddon,
  listGymAddons, grantGymAddon, updateGymAddon, cancelGymAddon,
} from '../controllers/platformAddons';
// Coupons
import {
  listCoupons, createCoupon, updateCoupon, toggleCoupon, deleteCoupon, validateCoupon,
} from '../controllers/platformCoupons';
// System & misc
import { listAuditLogs, getSystemStatus, listTickets, updateTicketStatus, listBroadcasts, createBroadcast, getTicketAnalytics, assignTicket, addTicketRating, listKnowledgeBase, createKnowledgeBase, updateKnowledgeBase, deleteKnowledgeBase } from '../controllers/platformAdmin';
import {
  getNotificationSettings, updateNotificationSettings,
  getNotificationHistory, sendTestNotification, getNotificationSummary,
  markNotificationRead,
} from '../controllers/notificationsEngine';
import {
  getOnboardingProgress, saveOnboardingStep, completeOnboarding,
  getPlatformSettings, updatePlatformSettings,
} from '../controllers/onboarding';
import {
  getPlatformBranding, updatePlatformBranding, uploadBrandingFile,
} from '../controllers/branding';
import { getReportsOverview, getMultiTenantReport, getReportsMetrics, getTenantsWithGrowth, getRevenueTrend, getChurnAnalysis, getGeoDistribution, getPlanPerformance, getOverduePayments, getGymPerformance } from '../controllers/platformReports';
import {
  listCampaigns, createCampaign, updateCampaignStatus, deleteCampaign,
  listEmailTemplates, createEmailTemplate, deleteEmailTemplate,
  listReferrals, getLoyaltySummary,
} from '../controllers/platformMarketing';
import {
  getChurnPrediction, getPlanRecommendations, getRevenueForecast, getAISuggestions, getAIDashboard,
} from '../controllers/platformAI';
import { listApiKeys, createApiKey, deleteApiKey, toggleApiKey, getApiUsage } from '../controllers/developerPortal';
import {
  listContracts, getContract, createContract, updateContract, cancelContract, renewContract,
  issueContractInvoice, markInvoicePaid,
  addContractItem, cancelContractItem, updateContractItem,
} from '../controllers/platformContracts';
import { getPlatformOverview, listEnforcementQueue, listPlatformAuditLogs } from '../controllers/platformInsights';
import { planGuard } from '../middleware/planGuard';
// Schemas
import {
  platformLoginSchema, refreshTokenSchema, forgotPasswordSchema, resetPasswordSchema,
  createGymSchema, setGymActiveSchema,
  createPlatformAdminSchema, updatePlatformAdminSchema,
  createBillingPlanSchema, updateBillingPlanSchema, initiateFawryPaymentSchema,
  setPlanDiscountSchema, togglePlanDiscountSchema,
  createCouponSchema, updateCouponSchema, validateCouponInputSchema,
  updateTicketStatusSchema, createBroadcastSchema,
  updateNotificationSettingsSchema, sendTestNotificationSchema,
  saveOnboardingStepSchema, completeOnboardingSchema, updatePlatformSettingsSchema,
  updateBrandingSchema,
  createApiKeySchema,
  getMultiTenantReportSchema,
  createContractSchema, updateContractSchema, renewContractSchema, cancelContractSchema,
  addContractItemSchema, updateContractItemSchema, markInvoicePaidSchema,
} from '../validators/schemas';

const router = Router();

// Multer config for logo uploads (max 2 MB, images only)
const logoStorage = multer.diskStorage({
  destination: path.resolve(__dirname, '../../uploads'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `logo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|svg|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, png, gif, svg, webp) are allowed.'));
    }
  },
});

// Public: platform admin login (separate credential space from staff_users)
router.post('/auth/login', authRateLimit, validate(platformLoginSchema), platformAdminLogin);
router.post('/auth/refresh', validate(refreshTokenSchema), platformRefreshToken);
router.post('/auth/logout', platformLogout);
router.post('/auth/forgot-password', authRateLimit, validate(forgotPasswordSchema), platformForgotPassword);
router.post('/auth/reset-password', authRateLimit, validate(resetPasswordSchema), platformResetPassword);

// Everything below requires a valid platform_admin token
router.use(authenticatePlatformAdmin);
router.use(authorizePlatformAdminRoute);

// CSRF Protection — applied to all authenticated platform routes
router.use(csrfProtection);

// Public endpoint to get CSRF token (after authentication)
router.get('/csrf-token', csrfTokenHandler);
router.get('/auth/session', (req, res) => {
  res.json({
    admin: {
      id: req.platformAdmin?.platform_admin_id,
      role_type: req.platformAdmin?.role_type,
    },
  });
});

router.get('/gyms', listGyms);
router.get('/gyms/check-subdomain', checkSubdomainAvailability);
router.get('/gyms/:id', getGym);
router.post('/gyms', validate(createGymSchema), createGym);
router.patch('/gyms/:id/active', validate(setGymActiveSchema), setGymActive);
router.put('/gyms/:id/subscription', planGuard({ gymSource: 'params' }), updateGymSubscription);
router.put('/gyms/:id', planGuard({ gymSource: 'params' }), updateGymFull);
router.delete('/gyms/:id', deleteGym);

// Gym Settings (super admin can manage settings for any gym)
router.get('/gyms/:id/settings', getGymSettings);
router.put('/gyms/:id/settings', updateGymSettings);

// Impersonation — super admin can log in as gym manager
router.post('/gyms/:id/impersonate', impersonateGym);

// Platform admins management (RBAC)
router.get('/admins', listPlatformAdmins);
router.post('/admins', validate(createPlatformAdminSchema), createPlatformAdmin);
router.patch('/admins/:id', validate(updatePlatformAdminSchema), updatePlatformAdmin);
router.delete('/admins/:id', deletePlatformAdmin);

// Security Center
router.get('/security/overview', getSecurityOverview);
router.get('/security/settings', getSecuritySettings);
router.put('/security/settings', updateSecuritySettings);
router.get('/security/sessions', listPlatformAdminSessions);
router.delete('/security/sessions/:id', revokePlatformAdminSession);
router.get('/security/feature-flags', getFeatureFlags);
router.put('/security/feature-flags', updateFeatureFlags);

// 2FA endpoints
router.post('/security/2fa/setup', authenticatePlatformAdmin, setup2FA);
router.post('/security/2fa/verify', authenticatePlatformAdmin, verify2FA);
router.post('/security/2fa/disable', authenticatePlatformAdmin, disable2FA);

// Logo upload (returns the URL path to store on the gym record)
router.post('/upload/logo', (req, res) => {
  uploadLogo.single('logo')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Upload failed.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded.' });
      return;
    }
    res.json({ data: { url: `/uploads/${req.file.filename}` } });
  });
});

router.get('/audit-logs', listAuditLogs);
router.get('/system-status', getSystemStatus);
router.get('/tickets', listTickets);
router.patch('/tickets/:id/status', validate(updateTicketStatusSchema), updateTicketStatus);
router.get('/tickets/analytics', getTicketAnalytics);
router.patch('/tickets/:id/assign', assignTicket);
router.post('/tickets/:id/rating', addTicketRating);
router.get('/tickets/knowledge-base', listKnowledgeBase);
router.post('/tickets/knowledge-base', createKnowledgeBase);
router.put('/tickets/knowledge-base/:id', updateKnowledgeBase);
router.delete('/tickets/knowledge-base/:id', deleteKnowledgeBase);
router.get('/broadcasts', listBroadcasts);
router.post('/broadcasts', validate(createBroadcastSchema), createBroadcast);
router.get('/billing/plans', listBillingPlans);
router.post('/billing/plans', validate(createBillingPlanSchema), createBillingPlan);
router.put('/billing/plans/:id', validate(updateBillingPlanSchema), updateBillingPlan);
router.delete('/billing/plans/:id', deleteBillingPlan);
// §46 — خصم الباقة: إقامة/تعديل، تفعيل/تعطيل، وحذف (يرجع السعر الكامل)
router.post('/billing/plans/:id/discount', validate(setPlanDiscountSchema), setPlanDiscount);
router.patch('/billing/plans/:id/discount/toggle', validate(togglePlanDiscountSchema), togglePlanDiscount);
router.delete('/billing/plans/:id/discount', deletePlanDiscount);
// §36: كتالوج الإضافات + إسناد لكل صالة (سعر مخفّض بيد السوبر-أدمن)
router.get('/billing/addons', listAddons);
router.post('/billing/addons', createAddon);
router.put('/billing/addons/:id', updateAddon);
router.delete('/billing/addons/:id', deleteAddon);
router.get('/gyms/:id/addons', listGymAddons);
router.post('/gyms/:id/addons', grantGymAddon);
router.put('/gyms/:gymId/addons/:itemId', updateGymAddon);
router.post('/gyms/:gymId/addons/:itemId/cancel', cancelGymAddon);
router.get('/billing/invoices', listInvoices);
router.get('/billing/summary', getBillingSummary);

// §40: عقود المنصة — مصدر الحقيقة التعاقدية (تستبدل إسناد gym_addons اليدوي)
router.get('/billing/contracts', listContracts);
router.post('/billing/contracts', validate(createContractSchema), createContract);
router.get('/billing/contracts/:id', getContract);
router.patch('/billing/contracts/:id', validate(updateContractSchema), updateContract);
router.post('/billing/contracts/:id/cancel', validate(cancelContractSchema), cancelContract);
router.post('/billing/contracts/:id/renew', validate(renewContractSchema), renewContract);
router.post('/billing/contracts/:id/invoices', issueContractInvoice);
router.post('/billing/contracts/:id/items', validate(addContractItemSchema), addContractItem);
router.patch('/billing/contract-items/:id', validate(updateContractItemSchema), updateContractItem);
router.post('/billing/contract-items/:id/cancel', cancelContractItem);
router.post('/billing/invoices/:id/mark-paid', validate(markInvoicePaidSchema), markInvoicePaid);

// §40: رؤى المنصة الحية + طابور الإيقاف + تدقيق المنصة
router.get('/overview', getPlatformOverview);
router.get('/enforcement', listEnforcementQueue);
router.get('/security/audit', listPlatformAuditLogs);

// Coupons & Promo Codes — §46: إنشاء/تعديل/تفعيل/حذف على الصيغة القانونية
router.get('/billing/coupons', listCoupons);
router.post('/billing/coupons', validate(createCouponSchema), createCoupon);
router.put('/billing/coupons/:id', validate(updateCouponSchema), updateCoupon);
router.patch('/billing/coupons/:id/toggle', toggleCoupon);
router.delete('/billing/coupons/:id', deleteCoupon);
router.post('/billing/coupons/validate', validate(validateCouponInputSchema), validateCoupon);

// Fawry Payment
router.post('/billing/payments/fawry', validate(initiateFawryPaymentSchema), initiateFawryPayment);

// Custom Plans (per-gym)
router.post('/billing/custom-plans', createCustomPlan);
router.get('/billing/custom-plans', listCustomPlans);

// Trial Period Management
router.post('/billing/trials', setTrialPeriod);
router.get('/billing/trials', listTrials);

// Auto Upgrade/Downgrade Rules
router.post('/billing/auto-rules', setAutoUpgradeRule);
router.get('/billing/auto-rules', listAutoUpgradeRules);
router.delete('/billing/auto-rules/:id', deleteAutoUpgradeRule);

// Marketing Campaigns
router.get('/marketing/campaigns', listCampaigns);
router.post('/marketing/campaigns', createCampaign);
router.patch('/marketing/campaigns/:id/status', updateCampaignStatus);
router.delete('/marketing/campaigns/:id', deleteCampaign);

// Marketing Email Templates
router.get('/marketing/email-templates', listEmailTemplates);
router.post('/marketing/email-templates', createEmailTemplate);
router.delete('/marketing/email-templates/:id', deleteEmailTemplate);

// Marketing Referrals & Loyalty
router.get('/marketing/referrals', listReferrals);
router.get('/marketing/loyalty-summary', getLoyaltySummary);

// AI Analytics
router.get('/ai/dashboard', getAIDashboard);
router.get('/ai/churn', getChurnPrediction);
router.get('/ai/plan-recommendations', getPlanRecommendations);
router.get('/ai/revenue-forecast', getRevenueForecast);
router.get('/ai/suggestions', getAISuggestions);

// Notifications Engine
router.get('/notifications/settings', getNotificationSettings);
router.put('/notifications/settings/:channel', validate(updateNotificationSettingsSchema), updateNotificationSettings);
router.get('/notifications/history', getNotificationHistory);
router.post('/notifications/test', validate(sendTestNotificationSchema), sendTestNotification);
router.get('/notifications/summary', getNotificationSummary);
router.patch('/notifications/history/:id/read', markNotificationRead);

// Onboarding Wizard
router.get('/onboarding', getOnboardingProgress);
router.post('/onboarding/step', validate(saveOnboardingStepSchema), saveOnboardingStep);
router.post('/onboarding/complete', validate(completeOnboardingSchema), completeOnboarding);

// Platform Settings
router.get('/settings', getPlatformSettings);
router.put('/settings', validate(updatePlatformSettingsSchema), updatePlatformSettings);

// Platform Branding
router.get('/branding', getPlatformBranding);
router.put('/branding', validate(updateBrandingSchema), updatePlatformBranding);
router.post('/upload/branding', (req, res) => {
  const uploadLogo = multer({
    storage: multer.diskStorage({
      destination: path.resolve(__dirname, '../../uploads'),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        cb(null, `branding-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
      },
    }),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = /\.(jpg|jpeg|png|gif|svg|webp|ico)$/i;
      if (allowed.test(path.extname(file.originalname))) {
        cb(null, true);
      } else {
        cb(new Error('Only image files (jpg, png, gif, svg, webp, ico) are allowed.'));
      }
    },
  }).single('file');

  uploadLogo(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Upload failed.' });
      return;
    }
    uploadBrandingFile(req, res);
  });
});

// Platform Reports
router.get('/reports/overview', getReportsOverview);
router.post('/reports/multi-tenant', validate(getMultiTenantReportSchema), getMultiTenantReport);
router.get('/reports/metrics', getReportsMetrics);
router.get('/reports/tenants-growth', getTenantsWithGrowth);
router.get('/reports/revenue-trend', getRevenueTrend);
router.get('/reports/churn-analysis', getChurnAnalysis);
router.get('/reports/geo-distribution', getGeoDistribution);
router.get('/reports/plan-performance', getPlanPerformance);
router.get('/reports/overdue-payments', getOverduePayments);
router.get('/reports/gym-performance', getGymPerformance);

// Developer Portal
router.get('/developer/keys', listApiKeys);
router.post('/developer/keys', validate(createApiKeySchema), createApiKey);
router.delete('/developer/keys/:id', deleteApiKey);
router.patch('/developer/keys/:id/toggle', toggleApiKey);
router.get('/developer/usage', getApiUsage);

export default router;
