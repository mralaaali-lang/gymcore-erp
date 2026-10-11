-- ====================================================================
-- Migration 031: Billing Coupons Enhancements — min_amount & first_purchase_only
-- ====================================================================

ALTER TABLE billing_coupons ADD COLUMN IF NOT EXISTS min_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE billing_coupons ADD COLUMN IF NOT EXISTS first_purchase_only BOOLEAN NOT NULL DEFAULT false;

-- Update the BillingCoupon type to include new fields
COMMENT ON COLUMN billing_coupons.min_amount IS 'Minimum cart amount required to use this coupon (0 = no minimum)';
COMMENT ON COLUMN billing_coupons.first_purchase_only IS 'If true, coupon can only be used on the first purchase';
