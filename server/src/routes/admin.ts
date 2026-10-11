import { Router } from 'express';
import {
  getOtaStatus,
  createOtaBackup,
  deployUpdate,
  rollbackVersion,
  deleteVersion,
  resetProject,
  getResetStatus,
} from '../controllers/ota';
import {
  createTenantBackup,
  listTenantBackups,
  downloadBackup,
  restoreTenantBackup,
} from '../controllers/backup';
import { authenticateAndIsolateTenant, requireRole } from '../middleware/auth';
import { authenticatePlatformAdmin } from '../middleware/platformAuth';

const router = Router();

// ====================================================================
// OTA Update Manager — true Super Admin routes (no tenant/gym context —
// these operate on the platform itself, not on any single gym's data).
//
// Previously this checked `role === 'owner'` on an ordinary staff JWT,
// which meant ANY gym's owner account could reach these platform-wide
// endpoints — a cross-tenant privilege escalation. authenticatePlatformAdmin
// only accepts tokens issued by POST /platform/auth/login for accounts in
// the separate platform_admins table.
// ====================================================================
router.get('/ota/status', authenticatePlatformAdmin, getOtaStatus);
router.post('/ota/backup', authenticatePlatformAdmin, createOtaBackup);
router.post('/ota/deploy', authenticatePlatformAdmin, deployUpdate);
router.post('/ota/rollback', authenticatePlatformAdmin, rollbackVersion);
router.post('/ota/delete', authenticatePlatformAdmin, deleteVersion);
router.post('/ota/reset', authenticatePlatformAdmin, resetProject);
router.get('/ota/reset/status', authenticatePlatformAdmin, getResetStatus);

// ====================================================================
// Tenant Backup — Regular staff routes (with tenant isolation)
// ====================================================================
router.use(authenticateAndIsolateTenant);
router.post('/backup/create', requireRole('manager'), createTenantBackup);
router.get('/backup/list', requireRole('manager'), listTenantBackups);
router.get('/backup/download/:folder', requireRole('manager'), downloadBackup);
router.post('/backup/restore', requireRole('manager'), restoreTenantBackup);

export default router;

