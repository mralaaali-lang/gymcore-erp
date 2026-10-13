import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { getAdminClient } from '../config/database';
import logger from '../config/logger';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ====================================================================
// MARKETING CAMPAIGNS
// ====================================================================
export const listCampaigns = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `SELECT c.*, g.name AS gym_name FROM marketing_campaigns c
       LEFT JOIN gyms g ON g.id = c.gym_id
       ORDER BY c.created_at DESC LIMIT 100`
    );
    await client.query('COMMIT');
    res.json({ data: result.rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('listCampaigns failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const createCampaign = async (req: Request, res: Response): Promise<void> => {
  const { name, name_ar, type, description, budget, scheduled_at, target_audience, gym_id } = req.body;
  if (!name || !type) { res.status(400).json({ error: 'name and type are required' }); return; }
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `INSERT INTO marketing_campaigns (name, name_ar, type, description, budget, scheduled_at, target_audience, gym_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft') RETURNING *`,
      [name, name_ar || null, type, description || null, budget || 0, scheduled_at || null, JSON.stringify(target_audience || {}), gym_id || null]
    );
    await client.query('COMMIT');
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('createCampaign failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const updateCampaignStatus = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { status } = req.body;
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `UPDATE marketing_campaigns SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    );
    if (result.rows.length === 0) { await client.query('ROLLBACK').catch(() => {}); res.status(404).json({ error: 'Campaign not found' }); return; }
    await client.query('COMMIT');
    res.json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('updateCampaignStatus failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const deleteCampaign = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const client = await getAdminClient();
  try {
    const result = await client.query('DELETE FROM marketing_campaigns WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) { await client.query('ROLLBACK').catch(() => {}); res.status(404).json({ error: 'Campaign not found' }); return; }
    await client.query('COMMIT');
    res.json({ data: { id: result.rows[0].id, deleted: true } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('deleteCampaign failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

// ====================================================================
// EMAIL TEMPLATES
// ====================================================================
export const listEmailTemplates = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const result = await client.query('SELECT * FROM marketing_email_templates ORDER BY updated_at DESC LIMIT 100');
    await client.query('COMMIT');
    res.json({ data: result.rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('listEmailTemplates failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const createEmailTemplate = async (req: Request, res: Response): Promise<void> => {
  const { name, name_ar, subject, subject_ar, body_html, type, variables } = req.body;
  if (!name || !subject || !body_html) { res.status(400).json({ error: 'name, subject and body_html are required' }); return; }
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `INSERT INTO marketing_email_templates (name, name_ar, subject, subject_ar, body_html, type, variables)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, name_ar || null, subject, subject_ar || null, body_html, type || 'custom', JSON.stringify(variables || [])]
    );
    await client.query('COMMIT');
    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('createEmailTemplate failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

export const deleteEmailTemplate = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const client = await getAdminClient();
  try {
    const result = await client.query('DELETE FROM marketing_email_templates WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) { await client.query('ROLLBACK').catch(() => {}); res.status(404).json({ error: 'Template not found' }); return; }
    await client.query('COMMIT');
    res.json({ data: { id: result.rows[0].id, deleted: true } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('deleteEmailTemplate failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

// ====================================================================
// REFERRALS
// ====================================================================
export const listReferrals = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    const result = await client.query(
      `SELECT r.*, g.name AS gym_name, mp.full_name AS referred_member_name
       FROM marketing_referrals r
       LEFT JOIN gyms g ON g.id = r.referrer_gym_id
       LEFT JOIN member_profiles mp ON mp.id = r.referred_member_id
       ORDER BY r.created_at DESC LIMIT 100`
    );
    await client.query('COMMIT');
    res.json({ data: result.rows });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('listReferrals failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};

// ====================================================================
// LOYALTY PROGRAM
// ====================================================================
export const getLoyaltySummary = async (_req: Request, res: Response): Promise<void> => {
  const client = await getAdminClient();
  try {
    // §31: loyalty_points/member_profiles were dropped by migration 044 —
    // read the live loyalty_accounts aggregate instead.
    const totalPoints = await client.query('SELECT COALESCE(SUM(current_points), 0)::numeric(12,0) AS total FROM loyalty_accounts');
    const activeMembers = await client.query('SELECT COUNT(DISTINCT member_id)::int AS count FROM loyalty_accounts WHERE current_points > 0');
    const totalRedeemed = await client.query(`SELECT COALESCE(SUM(-points), 0)::numeric(12,0) AS total FROM loyalty_transactions WHERE type = 'redeemed'`);
    const summary = await client.query(`
      SELECT gp.name AS plan_name, COUNT(DISTINCT la.member_id)::int AS members
      FROM loyalty_accounts la
      JOIN gyms g ON g.id = la.gym_id
      JOIN billing_plans gp ON gp.id = g.plan_id
      GROUP BY gp.name ORDER BY members DESC
    `);
    await client.query('COMMIT');
    res.json({
      data: {
        total_points: totalPoints.rows[0]?.total || 0,
        active_members: activeMembers.rows[0]?.count || 0,
        total_redeemed: totalRedeemed.rows[0]?.total || 0,
        by_plan: summary.rows,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    Sentry.captureException(error);
    logger.error('getLoyaltySummary failed', { error: getErrorMessage(error) });
    res.status(500).json({ error: 'Internal server error.' });
  } finally { client.release(); }
};
