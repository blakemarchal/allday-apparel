-- Minimal production seed for Allday Merch.
-- Idempotent (safe to re-run). Does NOT create demo products — Will/Blake add
-- real catalog via the admin UI. Real brand tokens replace the placeholders
-- below once intake styling is applied (see task: apply Will's brand tokens).

-- === Storefronts ===
INSERT INTO storefront (slug, name, currency, free_shipping_threshold_cents, flat_shipping_cents)
VALUES
  ('apparel',   'Allday Apparel',       'USD', NULL, NULL),
  ('character', 'Will Allday',          'USD', NULL, NULL)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

-- === Hostnames → storefront ===
-- Apparel is the apex + www. Character is path-based (/WillAllday) on the same
-- host, so it has NO host row — it's resolved by path prefix once that routing
-- lands. admin.allday-apparel.com is detected by the `admin.` prefix in code.
INSERT INTO storefront_host (storefront_id, hostname, is_primary)
SELECT id, 'allday-apparel.com', true FROM storefront WHERE slug = 'apparel'
ON CONFLICT (hostname) DO NOTHING;

INSERT INTO storefront_host (storefront_id, hostname, is_primary)
SELECT id, 'www.allday-apparel.com', false FROM storefront WHERE slug = 'apparel'
ON CONFLICT (hostname) DO NOTHING;

-- === Placeholder themes (replaced when Will's brand values are applied) ===
INSERT INTO theme_config (storefront_id, tokens, landing)
SELECT id, '{
  "colors": {"background":"#fafafa","foreground":"#0a0a0a","primary":"#0a0a0a","primaryForeground":"#fafafa","accent":"#525252","accentForeground":"#ffffff","muted":"#f4f4f5","mutedForeground":"#737373","border":"#d4d4d4"},
  "fonts": {"body":"Inter, system-ui, sans-serif","heading":"Inter, system-ui, sans-serif"},
  "radius": "0.25rem"
}'::jsonb, '{}'::jsonb
FROM storefront WHERE slug = 'apparel'
ON CONFLICT (storefront_id) DO NOTHING;

INSERT INTO theme_config (storefront_id, tokens, landing)
SELECT id, '{
  "colors": {"background":"#0a0a0a","foreground":"#fafafa","primary":"#dc2626","primaryForeground":"#fafafa","accent":"#fbbf24","accentForeground":"#0a0a0a","muted":"#171717","mutedForeground":"#a3a3a3","border":"#404040"},
  "fonts": {"body":"Inter, system-ui, sans-serif","heading":"Bebas Neue, Impact, sans-serif"},
  "radius": "0"
}'::jsonb, '{}'::jsonb
FROM storefront WHERE slug = 'character'
ON CONFLICT (storefront_id) DO NOTHING;

-- === Bootstrap admin (Blake = owner). Binds to Supabase on first sign-in. ===
INSERT INTO admin_user (email, name, role, status)
VALUES ('blakemarchal@gmail.com', 'Blake', 'owner', 'invited')
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role;
