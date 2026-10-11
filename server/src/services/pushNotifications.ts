import axios from 'axios';
import { query } from '../config/database';
import logger from '../config/logger';

const EXPO_PUSH_API = 'https://exp.host/--/api/v2/push/send';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  badge?: number;
  priority?: 'default' | 'normal' | 'high';
}

interface PushLogEntry {
  member_id: string | null;
  gym_id: string | null;
  expo_token: string;
  title: string;
  body: string;
  data: Record<string, any>;
  status: string;
  error_message?: string;
}

/**
 * Send a single push notification via Expo Push API
 */
export async function sendPushNotification(
  expoToken: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  if (!expoToken || !expoToken.startsWith('ExponentPushToken')) {
    return { success: false, error: 'Invalid Expo push token format' };
  }

  const message: ExpoPushMessage = {
    to: expoToken,
    title,
    body,
    data: data || {},
    sound: 'default',
    priority: 'high',
  };

  try {
    const response = await axios.post(EXPO_PUSH_API, message, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    const result = response.data?.data;

    // Expo returns an array of results (one per recipient)
    if (result && Array.isArray(result) && result.length > 0) {
      const receipt = result[0];
      if (receipt.status === 'error') {
        // Remove invalid/expired tokens
        if (receipt.details?.error === 'DeviceNotRegistered') {
          await deactivateToken(expoToken);
        }
        return { success: false, error: receipt.message || receipt.details?.error };
      }
    }

    return { success: true };
  } catch (error: any) {
    logger.error('Expo push API call failed', {
      error: error.message,
      expoToken: expoToken.substring(0, 20) + '...',
    });
    return { success: false, error: error.message };
  }
}

/**
 * Send push notification to all active devices of a member
 */
export async function sendToMember(
  memberId: string,
  gymId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<{ sent: number; failed: number }> {
  try {
    const tokens = await query(
      `SELECT id, expo_token FROM push_tokens
       WHERE member_id = $1 AND gym_id = $2 AND is_active = true`,
      [memberId, gymId]
    );

    let sent = 0;
    let failed = 0;

    for (const row of tokens.rows) {
      const result = await sendPushNotification(row.expo_token, title, body, data);
      await logPush({
        member_id: memberId,
        gym_id: gymId,
        expo_token: row.expo_token,
        title,
        body,
        data: data || {},
        status: result.success ? 'sent' : 'failed',
        error_message: result.error,
      });

      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    }

    return { sent, failed };
  } catch (error: any) {
    logger.error('Failed to send push to member', {
      memberId,
      gymId,
      error: error.message,
    });
    return { sent: 0, failed: 1 };
  }
}

/**
 * Send push notification to all members of a gym (broadcast)
 */
export async function sendToGymMembers(
  gymId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<{ sent: number; failed: number }> {
  try {
    const tokens = await query(
      `SELECT pt.id, pt.expo_token, pt.member_id
       FROM push_tokens pt
       WHERE pt.gym_id = $1 AND pt.is_active = true`,
      [gymId]
    );

    let sent = 0;
    let failed = 0;

    for (const row of tokens.rows) {
      const result = await sendPushNotification(row.expo_token, title, body, data);
      await logPush({
        member_id: row.member_id,
        gym_id: gymId,
        expo_token: row.expo_token,
        title,
        body,
        data: data || {},
        status: result.success ? 'sent' : 'failed',
        error_message: result.error,
      });

      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    }

    logger.info('Broadcast push to gym', { gymId, sent, failed, total: tokens.rows.length });
    return { sent, failed };
  } catch (error: any) {
    logger.error('Failed to broadcast push to gym', {
      gymId,
      error: error.message,
    });
    return { sent: 0, failed: 1 };
  }
}

/**
 * Mark a push token as inactive (e.g., device unregistered)
 */
async function deactivateToken(expoToken: string): Promise<void> {
  try {
    await query(
      `UPDATE push_tokens SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE expo_token = $1`,
      [expoToken]
    );
    logger.info('Deactivated push token (DeviceNotRegistered)', {
      expoToken: expoToken.substring(0, 20) + '...',
    });
  } catch (error: any) {
    logger.error('Failed to deactivate push token', { error: error.message });
  }
}

/**
 * Log a push notification attempt for audit
 */
async function logPush(entry: PushLogEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO push_log (member_id, gym_id, expo_token, title, body, data, status, error_message, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, CURRENT_TIMESTAMP)`,
      [
        entry.member_id,
        entry.gym_id,
        entry.expo_token,
        entry.title,
        entry.body,
        JSON.stringify(entry.data),
        entry.status,
        entry.error_message || null,
      ]
    );
  } catch (error: any) {
    logger.error('Failed to write push log', { error: error.message });
  }
}

export const pushService = {
  sendPushNotification,
  sendToMember,
  sendToGymMembers,
};
