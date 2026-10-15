-- 072: product low-stock threshold for the alerts center (المخزون).
-- A product is "low" when stock_quantity <= min_stock (equal counts).
-- Default 5 matches the reference behavior; adjustable per product in المتجر.
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock integer NOT NULL DEFAULT 5
  CHECK (min_stock >= 0);
