import { Request } from 'express';
import jwt from 'jsonwebtoken';

export type StaffRole = 'manager' | 'receptionist' | 'coach';

export type UserRole = StaffRole | 'member';

export interface TokenPayload {
  staff_user_id?: string;
  member_id?: string;
  gym_id: string;
  role: UserRole;
}

export interface StaffUser {
  id: string;
  gym_id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: StaffRole;
  is_active: boolean;
  created_at: string;
}

export interface Member {
  id: string;
  gym_id: string;
  full_name: string;
  phone_number: string;
  photo_url: string | null;
  is_blacklisted: boolean;
  blacklist_reason: string | null;
  created_at: string;
}

export interface Gym {
  id: string;
  name: string;
  subdomain: string;
  /** §33-توحيد: billing_plans.id هو مصدر الحقيقة؛ plan_tier مرآة DB-maintained. */
  plan_id: string | null;
  plan_name: string | null;
  plan_tier: string;
  email: string | null;
  address_city: string | null;
  address_zip: string | null;
  is_active: boolean;
  created_at: string;
}

export interface MembershipOffer {
  id: string;
  gym_id: string;
  title: string;
  duration_days: number;
  price: number;
  is_active: boolean;
}

export interface MemberSubscription {
  id: string;
  gym_id: string;
  member_id: string;
  offer_id: string;
  price_paid: number;
  start_date: string;
  end_date: string;
  is_frozen: boolean;
  freeze_start_date: string | null;
  freeze_end_date: string | null;
  status: 'active' | 'expired' | 'frozen';
  created_at: string;
}

export interface Product {
  id: string;
  gym_id: string;
  name: string;
  barcode: string | null;
  stock_quantity: number;
  purchase_price: number;
  selling_price: number;
  created_at: string;
}

export interface PosOrder {
  id: string;
  gym_id: string;
  staff_user_id: string;
  member_id: string | null;
  total_amount: number;
  payment_method: 'cash' | 'card' | 'instapay';
  created_at: string;
}

export interface PosOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
}

export interface FinancialTransaction {
  id: string;
  gym_id: string;
  category_id: string | null;
  type: 'income' | 'expense';
  amount: number;
  description: string | null;
  staff_user_id: string;
  created_at: string;
}

export interface PendingAction {
  id: string;
  gym_id: string;
  requested_by_staff_id: string;
  action_type: string;
  target_table: string;
  target_record_id: string;
  old_data_json: Record<string, unknown>;
  new_data_json: Record<string, unknown>;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by_staff_id: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface ActivityLog {
  id: string;
  gym_id: string;
  staff_user_id: string | null;
  action_description: string;
  ip_address: string | null;
  created_at: string;
}

export interface FitnessClass {
  id: string;
  gym_id: string;
  coach_id: string;
  title: string;
  capacity: number;
  start_time: string;
  end_time: string;
  is_cancelled: boolean;
}

export interface ClassBooking {
  id: string;
  gym_id: string;
  class_id: string;
  member_id: string;
  booked_at: string;
  status: 'confirmed' | 'cancelled' | 'no_show';
}

export interface AttendanceLog {
  id: string;
  gym_id: string;
  member_id: string;
  check_in_time: string;
  entry_method: 'qr_code' | 'manual_phone';
  verified_by_staff_id: string | null;
}

export interface QrPayload {
  member_id: string;
  gym_id: string;
  timestamp: number;
  signature: string;
}

export interface PaginationQuery {
  page: number;
  limit: number;
  offset: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  record?: T;
  updated_profile?: T;
  action?: T;
}
