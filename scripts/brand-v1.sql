-- Allday Merch — v1 brand pass (Claude's "best shot" for Will to react to).
-- Apparel: warm-premium DTC (Buck Mason / Everlane energy) — warm off-white,
--   near-black ink, elegant Fraunces serif headline, restrained.
-- Character: loud ring-poster — near-black, electric red + gold, ultra-bold
--   Anton condensed display.
-- Font values reference the next/font CSS vars defined on <html> in layout.tsx.
-- Idempotent; safe to re-run. Update the copy/colors freely as Will weighs in.

UPDATE theme_config SET
  tokens = '{
    "colors": {
      "background": "#F6F4F0",
      "foreground": "#161513",
      "primary": "#161513",
      "primaryForeground": "#F6F4F0",
      "accent": "#9A8C7A",
      "accentForeground": "#FFFFFF",
      "muted": "#ECE8E2",
      "mutedForeground": "#6B6358",
      "border": "#DAD3C9"
    },
    "fonts": {
      "body": "var(--font-inter), system-ui, sans-serif",
      "heading": "var(--font-fraunces), Georgia, serif"
    },
    "radius": "0.125rem"
  }'::jsonb,
  landing = '{
    "hero": {
      "eyebrow": "ALLDAY · EST. 2026",
      "headline": "Built to outlast the season.",
      "sub": "Premium everyday essentials — clean lines, honest materials, and not a single logo shouting for attention. Made to be worn on repeat.",
      "ctaLabel": "Shop the collection"
    }
  }'::jsonb,
  updated_at = now()
WHERE storefront_id = (SELECT id FROM storefront WHERE slug = 'apparel');

-- Palette pulled from Will's actual ring gear: vivid purple + gold + white,
-- on an arena-dark stage. (Was a guessed red; corrected from his photo.)
UPDATE theme_config SET
  tokens = '{
    "colors": {
      "background": "#0C0A12",
      "foreground": "#F4F1EA",
      "primary": "#7C3AED",
      "primaryForeground": "#FFFFFF",
      "accent": "#E7B53B",
      "accentForeground": "#0C0A12",
      "muted": "#18141F",
      "mutedForeground": "#A89FB8",
      "border": "#2D2640"
    },
    "fonts": {
      "body": "var(--font-inter), system-ui, sans-serif",
      "heading": "var(--font-anton), Impact, sans-serif"
    },
    "radius": "0"
  }'::jsonb,
  landing = '{
    "hero": {
      "eyebrow": "WILL ALLDAY",
      "headline": "RIDE THE LIGHTNING",
      "sub": "Ringside-tested gear for the ones who never clock out. Limited drops, loud designs, gone when they''re gone.",
      "ctaLabel": "Enter the shop"
    }
  }'::jsonb,
  updated_at = now()
WHERE storefront_id = (SELECT id FROM storefront WHERE slug = 'character');

SELECT s.slug, tc.tokens->'colors'->>'primary' AS primary, tc.tokens->'fonts'->>'heading' AS heading, tc.landing->'hero'->>'headline' AS headline
FROM theme_config tc JOIN storefront s ON s.id = tc.storefront_id
ORDER BY s.slug;
