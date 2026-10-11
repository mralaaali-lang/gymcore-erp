import { Request, Response } from 'express';
import { withAdminClient } from '../config/database';
import logger from '../config/logger';

// ====================================================================
// Get notification settings (all channels)
// ====================================================================
export async function getNotificationSettings(_req: Request, res: Response): Promise<void> {
  try {
    const result = await withAdminClient((client) =>
      client.query(
        'SELECT id, channel, provider, is_enabled, config, created_at, updated_at FROM notification_settings ORDER BY channel'
      )
    );

    // Return as object keyed by channel
    const settings: Record<string, unknown> = {};
    for (const row of result.rows) {
      settings[row.channel] = {
        id: row.id,
        provider: row.provider,
        is_enabled: row.is_enabled,
        config: row.config,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    }

    res.json({ data: settings });
  } catch (error) {
    logger.error('getNotificationSettings failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
}

// ====================================================================
// Update notification settings for a channel
// ====================================================================
export async function updateNotificationSettings(req: Request, res: Response): Promise<void> {
  const { channel } = req.params;
  const { provider, is_enabled, config } = req.body;

  const validChannels = ['email', 'sms', 'push', 'webhook', 'in_app'];
  if (!validChannels.includes(channel)) {
    res.status(400).json({ error: `Invalid channel. Must be one of: ${validChannels.join(', ')}` });
    return;
  }

  try {
    const result = await withAdminClient<{ rows: any[]; skipped?: boolean }>(async (client) => {
      const sets: string[] = ['updated_at = CURRENT_TIMESTAMP'];
      const params: unknown[] = [];
      let idx = 1;

      if (provider !== undefined) {
        sets.push(`provider = $${idx++}`);
        params.push(provider);
      }
      if (is_enabled !== undefined) {
        sets.push(`is_enabled = $${idx++}`);
        params.push(is_enabled);
      }
      if (config !== undefined) {
        sets.push(`config = $${idx++}`);
        params.push(JSON.stringify(config));
      }

      if (sets.length === 1) {
        return { rows: [], skipped: true };
      }

      const queryResult = await client.query(
        `UPDATE notification_settings SET ${sets.join(', ')} WHERE channel = $${idx}
         RETURNING id, channel, provider, is_enabled, config, updated_at`,
        [...params, channel]
      );
      return { rows: queryResult.rows, skipped: false };
    });

    if (result.skipped) {
      res.status(400).json({ error: 'At least one field (provider, is_enabled, config) is required.' });
      return;
    }
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Channel not found.' });
      return;
    }

    res.json({ data: result.rows[0] });
  } catch (error) {
    logger.error('updateNotificationSettings failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
}

// ====================================================================
// Get notification history
// ====================================================================
export async function getNotificationHistory(req: Request, res: Response): Promise<void> {
  const { channel, status, limit } = req.query;
  try {
    const result = await withAdminClient((client) => {
      let sql = 'SELECT id, channel, recipient_type, recipient_id, recipient_label, title, content, status, error_message, sent_at, delivered_at, created_at FROM notification_history';
      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (channel && typeof channel === 'string') {
        conditions.push(`channel = $${idx++}`);
        params.push(channel);
      }
      if (status && typeof status === 'string') {
        conditions.push(`status = $${idx++}`);
        params.push(status);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      sql += ' ORDER BY created_at DESC';

      const limitNum = limit ? parseInt(limit as string, 10) : 50;
      if (!isNaN(limitNum) && limitNum > 0) {
        sql += ` LIMIT $${idx}`;
        params.push(limitNum);
      }

      return client.query(sql, params);
    });

    res.json({ data: result.rows });
  } catch (error) {
    logger.error('getNotificationHistory failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
}

// ====================================================================
// Mark a notification as read (delivered)
// ====================================================================
export async function markNotificationRead(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Notification id is required.' });
    return;
  }
  try {
    const result = await withAdminClient((client) =>
      client.query(
        `UPDATE notification_history
         SET status = 'delivered', delivered_at = COALESCE(delivered_at, NOW())
         WHERE id = $1 AND status <> 'failed'
         RETURNING id, status, delivered_at`,
        [id]
      )
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }
    res.json({ data: result.rows[0] });
  } catch (error) {
    logger.error('markNotificationRead failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
}

// ====================================================================
// Send a test notification
// ====================================================================
export async function sendTestNotification(req: Request, res: Response): Promise<void> {
  const { channel, recipient } = req.body;

  const validChannels = ['email', 'sms', 'push', 'webhook', 'in_app'];
  if (!validChannels.includes(channel)) {
    res.status(400).json({ error: `Invalid channel. Must be one of: ${validChannels.join(', ')}` });
    return;
  }

  // Record the test as a history entry
  try {
    const result = await withAdminClient((client) =>
      client.query(
        `INSERT INTO notification_history (channel, recipient_type, recipient_label, title, content, status, sent_at, created_by)
         VALUES ($1, 'test', $2, $3, $4, 'sent', CURRENT_TIMESTAMP, $5)
         RETURNING id, channel, recipient_label, title, status, sent_at`,
        [
          channel,
          recipient || 'test@example.com',
          `Test ${channel.toUpperCase()} Notification`,
          `This is a test notification sent via ${channel} channel.`,
          req.platformAdmin?.platform_admin_id || null,
        ]
      )
    );

    res.json({ data: result.rows[0], message: `Test ${channel} notification sent successfully.` });
  } catch (error) {
    logger.error('sendTestNotification failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
}

// ====================================================================
// Get notification summary stats
// ====================================================================
export async function getNotificationSummary(_req: Request, res: Response): Promise<void> {
  try {
    const [totalResult, channelResult, statusResult, todayResult, pendingResult, settingsResult] =
      await withAdminClient((client) =>
        Promise.all([
          client.query('SELECT COUNT(*)::int AS total FROM notification_history'),
          client.query('SELECT channel, COUNT(*)::int AS count FROM notification_history GROUP BY channel ORDER BY channel'),
          client.query(`SELECT status, COUNT(*)::int AS count FROM notification_history GROUP BY status`),
          client.query(`SELECT COUNT(*)::int AS today FROM notification_history WHERE created_at >= CURRENT_DATE`),
          client.query(`SELECT COUNT(*)::int AS pending FROM notification_history WHERE status = 'pending'`),
          client.query('SELECT channel, is_enabled FROM notification_settings'),
        ])
      );

    const enabledChannels: Record<string, boolean> = {};
    for (const row of settingsResult.rows) {
      enabledChannels[row.channel] = row.is_enabled;
    }

    const channelBreakdown: Record<string, number> = {};
    for (const row of channelResult.rows) {
      channelBreakdown[row.channel] = row.count;
    }

    const statusBreakdown: Record<string, number> = {};
    for (const row of statusResult.rows) {
      statusBreakdown[row.status] = row.count;
    }

    res.json({
      data: {
        total: totalResult.rows[0]?.total || 0,
        today: todayResult.rows[0]?.today || 0,
        pending: pendingResult.rows[0]?.pending || 0,
        channels: channelBreakdown,
        statuses: statusBreakdown,
        enabled_channels: enabledChannels,
      },
    });
  } catch (error) {
    logger.error('getNotificationSummary failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
}
