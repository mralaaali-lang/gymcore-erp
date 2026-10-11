/**
 * totp.service.ts — TOTP-based Two-Factor Authentication for platform admins [NEW - 2026]
 *
 * Uses speakeasy for TOTP generation/verification and qrcode for QR code generation.
 * Integrates with platform security settings and platform_admins table.
 */

import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { getAdminClient } from '../config/database';
import logger from '../config/logger';

export interface TOTPSetupResult {
  secret: string;
  qrCodeUrl: string;
  otpauthUrl: string;
}

export interface TOTPVerifyResult {
  success: boolean;
  adminId: string;
}

/**
 * Generate TOTP setup data for a platform admin
 */
export async function generateTOTPSetup(adminId: string, email: string): Promise<TOTPSetupResult> {
  const secret = speakeasy.generateSecret({
    name: `GymCore (${email})`,
    issuer: 'GymCore ERP',
    length: 32,
  });

  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);
  return {
    secret: secret.base32,
    qrCodeUrl,
    otpauthUrl: secret.otpauth_url!,
  };
}

/**
 * Verify a TOTP token against a secret
 */
export function verifyTOTPToken(token: string, secret: string): boolean {
  try {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2,
    });
  } catch {
    return false;
  }
}

/**
 * Enable TOTP for a platform admin
 */
export async function enableTOTP(adminId: string, secret: string): Promise<void> {
  const client = await getAdminClient();
  try {
    await client.query(
      'UPDATE platform_admins SET totp_secret = $1, totp_verified = true WHERE id = $2',
      [secret, adminId]
    );
    await client.query('UPDATE platform_security_settings SET two_factor_enabled = true, updated_at = NOW() WHERE id = 1');
    await client.query('COMMIT');
    logger.info('TOTP enabled', { adminId });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('enableTOTP failed', { error: (error as Error).message });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Disable TOTP for a platform admin
 */
export async function disableTOTP(adminId: string): Promise<void> {
  const client = await getAdminClient();
  try {
    await client.query(
      'UPDATE platform_admins SET totp_secret = NULL, totp_verified = false WHERE id = $1',
      [adminId]
    );
    await client.query('UPDATE platform_security_settings SET two_factor_enabled = false, updated_at = NOW() WHERE id = 1');
    await client.query('COMMIT');
    logger.info('TOTP disabled', { adminId });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('disableTOTP failed', { error: (error as Error).message });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Verify TOTP token during login (returns true if no 2FA required or token is valid)
 */
export async function verifyTOTPLogin(adminId: string | null, token?: string): Promise<boolean> {
  if (!adminId) return true;
  
  const client = await getAdminClient();
  try {
    const result = await client.query(
      'SELECT totp_secret, totp_verified FROM platform_admins WHERE id = $1',
      [adminId]
    );
    await client.query('COMMIT');
    const admin = result.rows[0];
    
    if (!admin?.totp_secret || !admin.totp_verified) {
      return true;
    }
    
    if (!token) {
      return false;
    }
    
    return verifyTOTPToken(token, admin.totp_secret);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('verifyTOTPLogin failed', { error: (error as Error).message });
    return false;
  } finally {
    client.release();
  }
}

export default {
  generateTOTPSetup,
  verifyTOTPToken,
  enableTOTP,
  disableTOTP,
  verifyTOTPLogin,
};
