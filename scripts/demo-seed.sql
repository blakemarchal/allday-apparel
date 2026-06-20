-- Demo catalog for the showcase. Realistic, on-brand placeholder products for
-- both stores so the storefronts are browsable end-to-end. Replace with Will's
-- real catalog when it lands. Idempotent (safe to re-run).
--
-- Apparel = premium everyday basics. Character = Will Allday wrestling merch
-- (purple/gold gimmick: the AllDay cowboy hat, lightning, a scarce signed 8x10).

-- ============================ APPAREL ============================
INSERT INTO product (storefront_id, slug, title, description, status)
SELECT id, v.slug, v.title, v.descr, 'published'
FROM storefront s,
  (VALUES
    ('everyday-heavyweight-tee','Everyday Heavyweight Tee','7.5oz combed cotton, boxy fit, pre-shrunk. The one you reach for first.'),
    ('garment-dyed-hoodie','Garment-Dyed Hoodie','Heavyweight fleece, garment-dyed for a lived-in tone. Built to soften with every wash.'),
    ('six-panel-cap','Structured 6-Panel Cap','Cotton twill, brass closure, no loud logo. Just clean.'),
    ('merino-beanie','Merino Watch Beanie','Fine-gauge merino, tight rib, warm without the bulk.'),
    ('canvas-tote','Heavyweight Canvas Tote','18oz natural canvas, boxed bottom, made to be overloaded.')
  ) AS v(slug,title,descr)
WHERE s.slug = 'apparel'
ON CONFLICT (storefront_id, slug) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, status = 'published';

-- Apparel variants (sized goods get S–XXL; accessories get OS)
WITH p AS (SELECT id FROM product WHERE slug='everyday-heavyweight-tee')
INSERT INTO variant (product_id, sku, price_cents, cost_cents, status)
SELECT p.id, 'EHT-'||sz, 3800, 1400, 'published' FROM p, unnest(ARRAY['S','M','L','XL','XXL']) sz
ON CONFLICT (product_id, sku) DO UPDATE SET price_cents=EXCLUDED.price_cents, cost_cents=EXCLUDED.cost_cents, status='published';

WITH p AS (SELECT id FROM product WHERE slug='garment-dyed-hoodie')
INSERT INTO variant (product_id, sku, price_cents, cost_cents, status)
SELECT p.id, 'GDH-'||sz, 8800, 3200, 'published' FROM p, unnest(ARRAY['S','M','L','XL','XXL']) sz
ON CONFLICT (product_id, sku) DO UPDATE SET price_cents=EXCLUDED.price_cents, cost_cents=EXCLUDED.cost_cents, status='published';

WITH p AS (SELECT id FROM product WHERE slug='six-panel-cap')
INSERT INTO variant (product_id, sku, price_cents, cost_cents, status)
SELECT p.id, 'CAP-OS', 3400, 1100, 'published' FROM p
ON CONFLICT (product_id, sku) DO UPDATE SET price_cents=EXCLUDED.price_cents, status='published';

WITH p AS (SELECT id FROM product WHERE slug='merino-beanie')
INSERT INTO variant (product_id, sku, price_cents, cost_cents, status)
SELECT p.id, 'BEAN-OS', 4200, 1500, 'published' FROM p
ON CONFLICT (product_id, sku) DO UPDATE SET price_cents=EXCLUDED.price_cents, status='published';

WITH p AS (SELECT id FROM product WHERE slug='canvas-tote')
INSERT INTO variant (product_id, sku, price_cents, cost_cents, status)
SELECT p.id, 'TOTE-OS', 2800, 900, 'published' FROM p
ON CONFLICT (product_id, sku) DO UPDATE SET price_cents=EXCLUDED.price_cents, status='published';

-- ============================ CHARACTER (Will Allday) ============================
INSERT INTO product (storefront_id, slug, title, description, status)
SELECT id, v.slug, v.title, v.descr, 'published'
FROM storefront s,
  (VALUES
    ('ride-the-lightning-tee','Ride the Lightning Tee','Front-hit lightning bolt, back-yoke ALLDAY. Ringside-tested, soft as hell.'),
    ('purple-reign-hoodie','Purple Reign Hoodie','Heavyweight purple fleece, gold puff-print crest. Loud on purpose.'),
    ('allday-snapback','AllDay Lightning Snapback','Flat-brim, gold embroidery, purple underbill. Cap off the fit.'),
    ('allday-cowboy-hat','AllDay Cowboy Hat — Purple','The entrance hat. Purple felt, gold studs, hand-finished. Strictly limited.'),
    ('signed-entrance-photo','Signed 8x10 — Entrance','Hand-signed glossy of the walkout. Numbered, one batch, gone for good.')
  ) AS v(slug,title,descr)
WHERE s.slug = 'character'
ON CONFLICT (storefront_id, slug) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, status = 'published';

WITH p AS (SELECT id FROM product WHERE slug='ride-the-lightning-tee')
INSERT INTO variant (product_id, sku, price_cents, cost_cents, status)
SELECT p.id, 'RTL-'||sz, 3500, 1200, 'published' FROM p, unnest(ARRAY['S','M','L','XL','XXL','3XL']) sz
ON CONFLICT (product_id, sku) DO UPDATE SET price_cents=EXCLUDED.price_cents, cost_cents=EXCLUDED.cost_cents, status='published';

WITH p AS (SELECT id FROM product WHERE slug='purple-reign-hoodie')
INSERT INTO variant (product_id, sku, price_cents, cost_cents, status)
SELECT p.id, 'PRH-'||sz, 7500, 2800, 'published' FROM p, unnest(ARRAY['S','M','L','XL','XXL']) sz
ON CONFLICT (product_id, sku) DO UPDATE SET price_cents=EXCLUDED.price_cents, cost_cents=EXCLUDED.cost_cents, status='published';

WITH p AS (SELECT id FROM product WHERE slug='allday-snapback')
INSERT INTO variant (product_id, sku, price_cents, cost_cents, status)
SELECT p.id, 'SNAP-OS', 4000, 1300, 'published' FROM p
ON CONFLICT (product_id, sku) DO UPDATE SET price_cents=EXCLUDED.price_cents, status='published';

WITH p AS (SELECT id FROM product WHERE slug='allday-cowboy-hat')
INSERT INTO variant (product_id, sku, price_cents, cost_cents, status)
SELECT p.id, 'HAT-OS', 12000, 5000, 'published' FROM p
ON CONFLICT (product_id, sku) DO UPDATE SET price_cents=EXCLUDED.price_cents, status='published';

WITH p AS (SELECT id FROM product WHERE slug='signed-entrance-photo')
INSERT INTO variant (product_id, sku, price_cents, cost_cents, status)
SELECT p.id, 'SIGN-OS', 5000, 600, 'published' FROM p
ON CONFLICT (product_id, sku) DO UPDATE SET price_cents=EXCLUDED.price_cents, status='published';

-- ============================ INVENTORY ============================
-- Default healthy stock for everything, then override the two scarce drops.
INSERT INTO inventory_item (variant_id, qty_on_hand, qty_reserved, low_stock_threshold)
SELECT v.id, 40, 0, 5
FROM variant v JOIN product p ON p.id = v.product_id JOIN storefront s ON s.id = p.storefront_id
WHERE s.slug IN ('apparel','character')
ON CONFLICT (variant_id) DO UPDATE SET qty_on_hand = EXCLUDED.qty_on_hand, low_stock_threshold = EXCLUDED.low_stock_threshold;

-- Scarce: cowboy hat (12) and signed photo (8) — show off limited stock.
UPDATE inventory_item SET qty_on_hand = 12, low_stock_threshold = 15
WHERE variant_id = (SELECT id FROM variant WHERE sku = 'HAT-OS');
UPDATE inventory_item SET qty_on_hand = 8, low_stock_threshold = 15
WHERE variant_id = (SELECT id FROM variant WHERE sku = 'SIGN-OS');

SELECT s.slug AS store, count(DISTINCT p.id) AS products, count(v.id) AS variants
FROM storefront s
JOIN product p ON p.storefront_id = s.id AND p.status='published'
JOIN variant v ON v.product_id = p.id AND v.status='published'
GROUP BY s.slug ORDER BY s.slug;
