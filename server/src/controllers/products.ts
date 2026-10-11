import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';

export const listProducts = async (req: Request, res: Response) => {
  const gym_id = req.staff?.gym_id;
  const search = req.query.search as string;
  try {
    let sql = 'SELECT * FROM products WHERE gym_id=$1';
    const params: unknown[] = [gym_id];
    if (search) { sql += ' AND (name ILIKE $2 OR barcode ILIKE $2)'; params.push(`%${search}%`); }
    sql += ' ORDER BY name';
    const r = await query(sql, params);
    res.json({ data: r.rows });
  } catch (e: any) { logger.error('listProducts failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const getProduct = async (req: Request, res: Response) => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`SELECT * FROM products WHERE id=$1 AND gym_id=$2`, [id, gym_id]);
    if (r.rows.length === 0) { res.status(404).json({ error: 'Product not found' }); return; }
    res.json({ data: r.rows[0] });
  } catch (e: any) { logger.error('getProduct failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const createProduct = async (req: Request, res: Response) => {
  const { name, barcode, stock_quantity, purchase_price, selling_price } = req.body;
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`INSERT INTO products (gym_id, name, barcode, stock_quantity, purchase_price, selling_price) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [gym_id, name, barcode || null, stock_quantity || 0, purchase_price, selling_price]);
    res.status(201).json({ data: r.rows[0] });
  } catch (e: any) { logger.error('createProduct failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const updateProduct = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, barcode, stock_quantity, purchase_price, selling_price } = req.body;
  const gym_id = req.staff?.gym_id;
  try {
    const r = await query(`UPDATE products SET name=COALESCE($1,name), barcode=COALESCE($2,barcode), stock_quantity=COALESCE($3,stock_quantity), purchase_price=COALESCE($4,purchase_price), selling_price=COALESCE($5,selling_price) WHERE id=$6 AND gym_id=$7 RETURNING *`, [name, barcode, stock_quantity, purchase_price, selling_price, id, gym_id]);
    if (r.rows.length === 0) { res.status(404).json({ error: 'Product not found' }); return; }
    res.json({ data: r.rows[0] });
  } catch (e: any) { logger.error('updateProduct failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};

export const deleteProduct = async (req: Request, res: Response) => {
  const { id } = req.params;
  const gym_id = req.staff?.gym_id;
  try {
    await query(`DELETE FROM products WHERE id=$1 AND gym_id=$2`, [id, gym_id]);
    res.json({ success: true });
  } catch (e: any) { logger.error('deleteProduct failed', { error: e.message }); res.status(500).json({ error: 'Internal error' }); }
};
