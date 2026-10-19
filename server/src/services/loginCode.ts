/**
 * loginCode.ts — the phone + code credential shared by members and staff.
 *
 * A "login code" is a short numeric secret typed after a phone number instead
 * of a password. It is stored bcrypt-hashed and can never be read back, which
 * is what makes the recovery path safe: "أرسل لي الكود" issues a NEW code and
 * replaces the old one, so there is no plaintext credential to leak.
 *
 * Storage:
 *   member → members.pin_code_hash       (since 010_member_pin.sql)
 *   staff  → staff_users.login_code_hash (since 083_staff_login_code.sql)
 *
 * staff_users.login_code_hash is deliberately NOT staff_users.pin_hash: that
 * one is the HR self check-in PIN typed on the shared front-desk kiosk.
 */
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { query } from '../config/database';
import logger from '../config/logger';
import { whatsapp } from './whatsapp';

export type LoginCodeHolder = 'member' | 'staff';

/** Four digits, matching the member code that has been live since 010. */
export const LOGIN_CODE_LENGTH = 4;

const TABLE: Record<LoginCodeHolder, string> = {
  member: 'members',
  staff: 'staff_users',
};

const COLUMN: Record<LoginCodeHolder, string> = {
  member: 'pin_code_hash',
  staff: 'login_code_hash',
};

/** crypto.randomInt is uniform and CSPRNG-backed; Math.random is neither. */
export function generateLoginCode(): string {
  const min = 10 ** (LOGIN_CODE_LENGTH - 1);
  return String(crypto.randomInt(min, min * 10));
}

export async function hashLoginCode(code: string): Promise<string> {
  return bcrypt.hash(code, 12);
}

/**
 * Issue a fresh code for ONE account and hand the plaintext back exactly once.
 * Every caller must put it in front of the owner (or the member) immediately —
 * the row keeps only the hash, so a code that was never shown is simply lost
 * and a new one has to be issued.
 */
export async function issueLoginCode(
  holder: LoginCodeHolder,
  id: string,
  gymId?: string | null,
): Promise<string> {
  const code = generateLoginCode();
  const hash = await hashLoginCode(code);
  const params: unknown[] = [hash, id];
  let sql = `UPDATE ${TABLE[holder]} SET ${COLUMN[holder]} = $1 WHERE id = $2`;
  if (gymId) {
    params.push(gymId);
    sql += ' AND gym_id = $3';
  }
  await query(sql, params);
  return code;
}

/**
 * Issue codes for many accounts at once, in parallel batches.
 *
 * Hashing is CPU-bound and bcrypt at cost 12 measured 157ms per call here, so
 * a 2 463-member cut-over would blow any HTTP timeout. libuv spreads the awaits
 * over its thread pool (8 at a time measured 322ms — ~40ms each), which is what
 * keeps a bulk chunk inside a normal request.
 */
export async function issueLoginCodes(
  holder: LoginCodeHolder,
  ids: string[],
  gymId?: string | null,
  batchSize = 8,
): Promise<string[]> {
  const codes: string[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const slice = ids.slice(i, i + batchSize);
    codes.push(...(await Promise.all(slice.map((id) => issueLoginCode(holder, id, gymId)))));
  }
  return codes;
}

/**
 * Send a code over WhatsApp. Returns false when nothing actually left the
 * building — including the `console` provider, which only logs the message.
 */
export async function sendLoginCode(
  phone: string,
  code: string,
  name: string,
  gymName?: string,
): Promise<boolean> {
  try {
    return await whatsapp.sendMessage({
      to: phone,
      memberName: name,
      type: 'login_code',
      gymName,
      data: { code },
    });
  } catch (error) {
    logger.error('Failed to send login code', { error: (error as Error).message });
    return false;
  }
}

/**
 * Digits only — the formats a real front desk types ("+20 100 123 4567",
 * "0100-123-4567") must all land on the same string. Member phones are
 * already canonical (`05xxxxxxxx`, enforced by the registration form and hashed
 * at insert time), so they keep the exact phone_hash lookup; free-text staff
 * phones are the ones that need this.
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}
