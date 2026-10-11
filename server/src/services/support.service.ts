/**
 * support.service.ts — Support tickets, conversation threads, SLA management
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface Ticket {
  id: string;
  ticket_number: string;
  gym_id: string | null;
  member_id: string | null;
  subject: string;
  description: string;
  category: string | null;
  priority: string;
  status: string;
  assigned_to: string | null;
  resolved_by: string | null;
  resolution: string | null;
  resolution_code: string | null;
  satisfaction_rating: number | null;
  first_response_at: string | null;
  resolved_at: string | null;
  sla_breach: boolean;
  created_at: string;
  updated_at: string;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_type: string;
  sender_id: string | null;
  content: string;
  attachments: unknown[];
  is_internal: boolean;
  created_at: string;
}

/**
 * Generate a unique ticket number
 */
function generateTicketNumber(): string {
  const prefix = 'TKT';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Create a new support ticket
 */
export async function createTicket(input: {
  gym_id?: string;
  member_id?: string;
  subject: string;
  description: string;
  category?: string;
  priority?: string;
}): Promise<Ticket> {
  const result = await pool.query(
    `INSERT INTO support_tickets (
      id, ticket_number, gym_id, member_id, subject, description,
      category, priority, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open')
    RETURNING *`,
    [
      uuidv4(), generateTicketNumber(), input.gym_id ?? null,
      input.member_id ?? null, input.subject, input.description,
      input.category ?? 'general', input.priority ?? 'medium',
    ]
  );
  return result.rows[0];
}

/**
 * Get tickets with optional filters
 */
export async function getTickets(filters: {
  gym_id?: string;
  status?: string;
  priority?: string;
  category?: string;
  assigned_to?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{ tickets: Ticket[]; total: number }> {
  const { gym_id, status, priority, category, assigned_to, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM support_tickets WHERE 1=1';
  const params: unknown[] = [];
  let idx = 1;

  if (gym_id) { query += ` AND gym_id = $${idx++}`; params.push(gym_id); }
  if (status) { query += ` AND status = $${idx++}`; params.push(status); }
  if (priority) { query += ` AND priority = $${idx++}`; params.push(priority); }
  if (category) { query += ` AND category = $${idx++}`; params.push(category); }
  if (assigned_to) { query += ` AND assigned_to = $${idx++}`; params.push(assigned_to); }

  query += ` ORDER BY 
    CASE priority
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
      ELSE 5
    END ASC, created_at DESC
    LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  let countQuery = 'SELECT COUNT(*) as total FROM support_tickets WHERE 1=1';
  const countParams: unknown[] = [];
  let countIdx = 1;
  if (gym_id) { countQuery += ` AND gym_id = $${countIdx++}`; countParams.push(gym_id); }
  if (status) { countQuery += ` AND status = $${countIdx++}`; countParams.push(status); }
  if (priority) { countQuery += ` AND priority = $${countIdx++}`; countParams.push(priority); }
  if (category) { countQuery += ` AND category = $${countIdx++}`; countParams.push(category); }
  if (assigned_to) { countQuery += ` AND assigned_to = $${countIdx++}`; countParams.push(assigned_to); }
  const countResult = await pool.query(countQuery, countParams);

  return {
    tickets: result.rows,
    total: parseInt(countResult.rows[0].total, 10),
  };
}

/**
 * Get single ticket by ID with messages
 */
export async function getTicket(ticketId: string): Promise<{ ticket: Ticket | null; messages: TicketMessage[] }> {
  const ticketResult = await pool.query(
    'SELECT * FROM support_tickets WHERE id = $1',
    [ticketId]
  );
  const ticket = ticketResult.rows[0] ?? null;

  const messagesResult = await pool.query(
    'SELECT * FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC',
    [ticketId]
  );

  return { ticket, messages: messagesResult.rows };
}

/**
 * Assign ticket to a staff member
 */
export async function assignTicket(ticketId: string, assignedTo: string): Promise<Ticket | null> {
  const result = await pool.query(
    `UPDATE support_tickets
     SET assigned_to = $2, status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING *`,
    [ticketId, assignedTo]
  );
  return result.rows[0] ?? null;
}

/**
 * Update ticket status
 */
export async function updateTicketStatus(
  ticketId: string,
  status: string,
  resolution?: string
): Promise<Ticket | null> {
  let query = `UPDATE support_tickets SET status = $2, updated_at = CURRENT_TIMESTAMP`;
  const params: unknown[] = [ticketId, status];

  if (status === 'resolved' || status === 'closed') {
    query += `, resolved_at = CURRENT_TIMESTAMP`;
    if (resolution) {
      query += `, resolution = $3, resolved_by = $4`;
      params.push(resolution, null);
    }
  }

  query += ` WHERE id = $1 RETURNING *`;
  const result = await pool.query(query, params);
  return result.rows[0] ?? null;
}

/**
 * Add a message to a ticket conversation
 */
export async function addTicketMessage(input: {
  ticket_id: string;
  sender_type: 'customer' | 'support' | 'system';
  sender_id?: string;
  content: string;
  is_internal?: boolean;
}): Promise<TicketMessage> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add message
    const result = await client.query(
      `INSERT INTO ticket_messages (id, ticket_id, sender_type, sender_id, content, is_internal)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        uuidv4(), input.ticket_id, input.sender_type,
        input.sender_id ?? null, input.content, input.is_internal ?? false,
      ]
    );

    // Update ticket status if customer responds
    if (input.sender_type === 'customer') {
      await client.query(
        `UPDATE support_tickets SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'waiting_customer'`,
        [input.ticket_id]
      );
    }

    // Set first response time if this is the first support response
    if (input.sender_type === 'support') {
      await client.query(
        `UPDATE support_tickets SET first_response_at = COALESCE(first_response_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [input.ticket_id]
      );
    }

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get ticket analytics / stats
 */
export async function getTicketAnalytics(gym_id?: string): Promise<{
  total: number;
  open: number;
  in_progress: number;
  closed: number;
  avg_resolution_hours: number;
  sla_breach_count: number;
}> {
  let query = 'SELECT * FROM support_tickets WHERE 1=1';
  const params: unknown[] = [];

  if (gym_id) {
    query += ' AND gym_id = $1';
    params.push(gym_id);
  }

  const result = await pool.query(query, params);
  const tickets: Ticket[] = result.rows;

  const open = tickets.filter(t => t.status === 'open').length;
  const inProgress = tickets.filter(t => t.status === 'in_progress').length;
  const closed = tickets.filter(t => t.status === 'closed').length;
  const slaBreach = tickets.filter(t => t.sla_breach).length;

  // Calculate average resolution time
  const resolved = tickets.filter(t => t.resolved_at && t.created_at);
  let avgResolutionHours = 0;
  if (resolved.length > 0) {
    const totalHours = resolved.reduce((sum, t) => {
      const created = new Date(t.created_at).getTime();
      const resolvedTime = new Date(t.resolved_at!).getTime();
      return sum + (resolvedTime - created) / (1000 * 60 * 60);
    }, 0);
    avgResolutionHours = Math.round(totalHours / resolved.length);
  }

  return {
    total: tickets.length,
    open,
    in_progress: inProgress,
    closed,
    avg_resolution_hours: avgResolutionHours,
    sla_breach_count: slaBreach,
  };
}

