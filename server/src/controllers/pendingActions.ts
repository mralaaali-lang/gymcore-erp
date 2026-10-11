import { Request, Response } from 'express';
import { query, getClient } from '../config/database';
import { ALLOWED_COLUMNS_BY_TABLE } from '../validators/schemas';
import logger from '../config/logger';

const ALLOWED_TABLES = [
  'members', 'member_subscriptions', 'membership_offers', 'products',
  'financial_transactions', 'staff_users', 'pos_orders', 'fitness_classes',
] as const;

type AllowedTable = typeof ALLOWED_TABLES[number];

function getOldRecord(table: AllowedTable, recordId: string, gymId: string) {
  const queries: Record<AllowedTable, string> = {
    members: 'SELECT * FROM members WHERE id = $1 AND gym_id = $2',
    member_subscriptions: 'SELECT * FROM member_subscriptions WHERE id = $1 AND gym_id = $2',
    membership_offers: 'SELECT * FROM membership_offers WHERE id = $1 AND gym_id = $2',
    products: 'SELECT * FROM products WHERE id = $1 AND gym_id = $2',
    financial_transactions: 'SELECT * FROM financial_transactions WHERE id = $1 AND gym_id = $2',
    staff_users: 'SELECT * FROM staff_users WHERE id = $1 AND gym_id = $2',
    pos_orders: 'SELECT * FROM pos_orders WHERE id = $1 AND gym_id = $2',
    fitness_classes: 'SELECT * FROM fitness_classes WHERE id = $1 AND gym_id = $2',
  };
  return query(queries[table], [recordId, gymId]);
}

function buildUpdateQuery(table: AllowedTable, newDataJson: Record<string, unknown>, recordId: string, gymId: string) {
  const allowedColumns = ALLOWED_COLUMNS_BY_TABLE[table];
  if (!allowedColumns) {
    throw new Error(`No column whitelist defined for table: ${table}`);
  }

  const invalidFields = Object.keys(newDataJson).filter((f) => !allowedColumns.includes(f));
  if (invalidFields.length > 0) {
    throw new Error(`Disallowed columns: ${invalidFields.join(', ')}. Allowed: ${allowedColumns.join(', ')}`);
  }

  const allowedPrefixes: Record<AllowedTable, string> = {
    members: 'UPDATE members SET ',
    member_subscriptions: 'UPDATE member_subscriptions SET ',
    membership_offers: 'UPDATE membership_offers SET ',
    products: 'UPDATE products SET ',
    financial_transactions: 'UPDATE financial_transactions SET ',
    staff_users: 'UPDATE staff_users SET ',
    pos_orders: 'UPDATE pos_orders SET ',
    fitness_classes: 'UPDATE fitness_classes SET ',
  };

  const fields = Object.keys(newDataJson);
  const setClause = fields.map((field, index) => `"${field}" = $${index + 1}`).join(', ');
  const values = fields.map((field) => newDataJson[field]);
  values.push(recordId, gymId);

  return {
    text: `${allowedPrefixes[table]}${setClause} WHERE id = $${values.length - 1} AND gym_id = $${values.length}`,
    values,
  };
}

export const createPendingAction = async (req: Request, res: Response): Promise<void> => {
  const { action_type, target_table, target_record_id, reason, new_data_json } = req.body;
  const gym_id = req.staff!.gym_id;
  const requested_by_staff_id = req.staff!.staff_user_id;

  if (!action_type || !target_table || !target_record_id || !reason || !new_data_json) {
    res.status(400).json({ error: 'Missing required fields: action_type, target_table, target_record_id, reason, new_data_json' });
    return;
  }

  if (!ALLOWED_TABLES.includes(target_table)) {
    res.status(403).json({ error: 'Modifications to this table are not allowed via pending actions.' });
    return;
  }

  const allowedCols = ALLOWED_COLUMNS_BY_TABLE[target_table];
  if (allowedCols) {
    const invalidFields = Object.keys(new_data_json).filter((f: string) => !allowedCols.includes(f));
    if (invalidFields.length > 0) {
      res.status(400).json({ error: `Disallowed columns: ${invalidFields.join(', ')}. Allowed: ${allowedCols.join(', ')}` });
      return;
    }
  }

  try {
    const oldDataResult = await getOldRecord(target_table, target_record_id, gym_id);

    if (oldDataResult.rows.length === 0) {
      res.status(404).json({ error: 'Target record not found in your gym scope.' });
      return;
    }

    const old_data_json = oldDataResult.rows[0];

    const insertResult = await query(
      `INSERT INTO pending_actions (gym_id, requested_by_staff_id, action_type, target_table, target_record_id, old_data_json, new_data_json, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, status`,
      [gym_id, requested_by_staff_id, action_type, target_table, target_record_id, old_data_json, JSON.stringify(new_data_json), reason]
    );

    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [gym_id, requested_by_staff_id, `Submitted ${action_type} request for ${target_table} record ${target_record_id}`, req.ip]
    );

    res.status(201).json({ message: 'Submitted for manager approval.', action: insertResult.rows[0] });
  } catch (error) {
    logger.error('Failed to create pending action', { requestId: (req as any).requestId, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const processPendingAction = async (req: Request, res: Response): Promise<void> => {
  const { action_id, decision } = req.body;
  const gym_id = req.staff!.gym_id;
  const reviewed_by_staff_id = req.staff!.staff_user_id;
  const user_role = req.staff?.role;

  if (!action_id || !decision || !['approved', 'rejected'].includes(decision)) {
    res.status(400).json({ error: 'Missing required fields: action_id and decision (approved|rejected).' });
    return;
  }

  if (user_role !== 'manager') {
    res.status(403).json({ error: 'Only managers can process pending requests.' });
    return;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const actionResult = await client.query(
      `SELECT * FROM pending_actions WHERE id = $1 AND gym_id = $2 AND status = 'pending' FOR UPDATE`,
      [action_id, gym_id]
    );

    if (actionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Pending action not found or already processed.' });
      return;
    }

    const action = actionResult.rows[0];

    if (decision === 'approved') {
      if (!ALLOWED_TABLES.includes(action.target_table)) {
        await client.query('ROLLBACK');
        res.status(403).json({ error: 'Target table is no longer allowed for modifications.' });
        return;
      }

      const { text, values } = buildUpdateQuery(action.target_table, action.new_data_json, action.target_record_id, gym_id);
      await client.query(text, values);
    }

    await client.query(
      `UPDATE pending_actions SET status = $1, reviewed_by_staff_id = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [decision, reviewed_by_staff_id, action_id]
    );

    await client.query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [gym_id, reviewed_by_staff_id, `Manager ${decision} request ${action_id} for ${action.target_table}`, req.ip]
    );

    await client.query('COMMIT');
    res.status(200).json({ message: `Action has been ${decision}.` });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to process pending action', { requestId: (req as any).requestId, error: (error as Error).message });
    res.status(500).json({ error: 'Transaction failed.' });
  } finally {
    client.release();
  }
};

export const listPendingActions = async (req: Request, res: Response): Promise<void> => {
  const gym_id = req.staff!.gym_id;
  const status = req.query.status || 'pending';

  try {
    const result = await query(
      `SELECT pa.*, su.full_name as requester_name
       FROM pending_actions pa
       JOIN staff_users su ON pa.requested_by_staff_id = su.id
       WHERE pa.gym_id = $1 AND pa.status = $2
       ORDER BY pa.created_at DESC
       LIMIT 50`,
      [gym_id, status]
    );

    res.status(200).json({ data: result.rows });
  } catch (error) {
    logger.error('Failed to list pending actions', { requestId: (req as any).requestId, error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error.' });
  }
};
