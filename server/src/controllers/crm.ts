import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';

export const listLeads = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search as string;
  const status = req.query.status as string;
  const source = req.query.source as string;

  try {
    let whereClause = 'WHERE gym_id = $1';
    const params: unknown[] = [gym_id];
    let paramIndex = 2;

    if (search) {
      whereClause += ` AND (name ILIKE $${paramIndex} OR phone ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (status) {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (source) {
      whereClause += ` AND source = $${paramIndex}`;
      params.push(source);
      paramIndex++;
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM gym_leads ${whereClause}`,
      params
    );

    const dataResult = await query(
      `SELECT * FROM gym_leads ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    res.status(200).json({
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
      },
    });
  } catch (error) {
    logger.error('Failed to list leads', { requestId: (req as any).requestId, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const getLeadById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;

  try {
    const result = await query(
      `SELECT * FROM gym_leads WHERE id = $1 AND gym_id = $2`,
      [id, gym_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Lead not found.' });
      return;
    }

    res.status(200).json({ data: result.rows[0] });
  } catch (error) {
    logger.error('Failed to get lead', { requestId: (req as any).requestId, leadId: id, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const createLead = async (req: Request, res: Response): Promise<void> => {
  const { name, phone, email, source, notes, assigned_to } = req.body;
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;

  try {
    const result = await query(
      `INSERT INTO gym_leads (gym_id, name, phone, email, source, notes, assigned_to)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [gym_id, name, phone, email || null, source || 'walk_in', notes || null, assigned_to || null]
    );

    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [gym_id, staff_user_id, `Created lead: ${name} (${phone})`, req.ip]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Failed to create lead', { requestId: (req as any).requestId, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const updateLead = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { name, phone, email, source, status, notes, assigned_to } = req.body;
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;

  try {
    const fields: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (name !== undefined) { fields.push(`name = $${paramIndex++}`); params.push(name); }
    if (phone !== undefined) { fields.push(`phone = $${paramIndex++}`); params.push(phone); }
    if (email !== undefined) { fields.push(`email = $${paramIndex++}`); params.push(email || null); }
    if (source !== undefined) { fields.push(`source = $${paramIndex++}`); params.push(source); }
    if (status !== undefined) { fields.push(`status = $${paramIndex++}`); params.push(status); }
    if (notes !== undefined) { fields.push(`notes = $${paramIndex++}`); params.push(notes || null); }
    if (assigned_to !== undefined) { fields.push(`assigned_to = $${paramIndex++}`); params.push(assigned_to); }

    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields to update.' });
      return;
    }

    params.push(id, gym_id);
    const result = await query(
      `UPDATE gym_leads SET ${fields.join(', ')} WHERE id = $${paramIndex++} AND gym_id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Lead not found.' });
      return;
    }

    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [gym_id, staff_user_id, `Updated lead: ${result.rows[0].name}`, req.ip]
    );

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Failed to update lead', { requestId: (req as any).requestId, leadId: id, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const deleteLead = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;

  try {
    const lead = await query(
      `SELECT name, status FROM gym_leads WHERE id = $1 AND gym_id = $2`,
      [id, gym_id]
    );

    if (lead.rows.length === 0) {
      res.status(404).json({ error: 'Lead not found.' });
      return;
    }

    if (lead.rows[0].status === 'converted') {
      res.status(400).json({ error: 'Cannot delete a converted lead.' });
      return;
    }

    await query(
      `DELETE FROM gym_leads WHERE id = $1 AND gym_id = $2`,
      [id, gym_id]
    );

    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [gym_id, staff_user_id, `Deleted lead: ${lead.rows[0].name}`, req.ip]
    );

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Failed to delete lead', { requestId: (req as any).requestId, leadId: id, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const getLeadStats = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff?.gym_id;

  try {
    const result = await query(
      `SELECT status, COUNT(*)::int AS count FROM gym_leads WHERE gym_id = $1 GROUP BY status ORDER BY status`,
      [gym_id]
    );

    res.status(200).json({ data: result.rows });
  } catch (error) {
    logger.error('Failed to get lead stats', { requestId: (req as any).requestId, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};
