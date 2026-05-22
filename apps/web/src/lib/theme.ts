import 'server-only';
import type { CSSProperties } from 'react';
import { eq } from 'drizzle-orm';
import { db } from '@allday/db';
import { themeConfig } from '@allday/db/schema';

/**
 * Theme tokens consumed by the storefront UI. Stored as `jsonb` on
 * theme_config.tokens (per-storefront). The shape is *the contract* —
 * once Will sends his brand input, only the values change.
 *
 * Real values are seeded as placeholders today (clean/premium for apparel,
 * gritty/loud for character). Swap when Will answers section 3 of the
 * intake form.
 */
export type ThemeTokens = {
  colors: {
    background: string;
    foreground: string;
    primary: string;
    primaryForeground: string;
    accent: string;
    accentForeground: string;
    muted: string;
    mutedForeground: string;
    border: string;
  };
  fonts: {
    body: string;
    heading: string;
  };
  radius: string;
};

/** Used for unconfigured hosts and as a defensive fallback. */
export const DEFAULT_THEME: ThemeTokens = {
  colors: {
    background: '#ffffff',
    foreground: '#0a0a0a',
    primary: '#0a0a0a',
    primaryForeground: '#ffffff',
    accent: '#737373',
    accentForeground: '#ffffff',
    muted: '#f4f4f5',
    mutedForeground: '#737373',
    border: '#e5e5e5',
  },
  fonts: {
    body: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    heading: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  radius: '0.375rem',
};

/**
 * Hardcoded admin theme. Admin doesn't have a storefront_id so it doesn't
 * live in theme_config — keep it neutral and trust-signal blue.
 */
export const ADMIN_THEME: ThemeTokens = {
  colors: {
    background: '#fafafa',
    foreground: '#0a0a0a',
    primary: '#2563eb',
    primaryForeground: '#ffffff',
    accent: '#0891b2',
    accentForeground: '#ffffff',
    muted: '#f4f4f5',
    mutedForeground: '#737373',
    border: '#e5e5e5',
  },
  fonts: {
    body: 'system-ui, -apple-system, sans-serif',
    heading: 'system-ui, -apple-system, sans-serif',
  },
  radius: '0.375rem',
};

/**
 * Fetch the theme tokens for a storefront. Returns DEFAULT_THEME if no row
 * exists yet (storefront created but not themed) or if the stored tokens are
 * partial — missing keys merge from defaults.
 */
export async function getThemeForStorefront(storefrontId: string): Promise<ThemeTokens> {
  const [row] = await db
    .select({ tokens: themeConfig.tokens })
    .from(themeConfig)
    .where(eq(themeConfig.storefrontId, storefrontId))
    .limit(1);

  if (!row || !row.tokens) return DEFAULT_THEME;

  return mergeWithDefaults(row.tokens as Partial<ThemeTokens>);
}

function mergeWithDefaults(t: Partial<ThemeTokens>): ThemeTokens {
  return {
    colors: { ...DEFAULT_THEME.colors, ...(t.colors ?? {}) },
    fonts: { ...DEFAULT_THEME.fonts, ...(t.fonts ?? {}) },
    radius: t.radius ?? DEFAULT_THEME.radius,
  };
}

/**
 * Convert tokens to an inline-style object setting CSS custom properties.
 * Used on `<body>` so all child CSS can reference `var(--color-primary)` etc.
 *
 * Cast through Record<string, string> because React's CSSProperties type
 * doesn't allow `--`-prefixed keys.
 */
export function themeStyleVars(t: ThemeTokens): CSSProperties {
  return {
    '--color-background': t.colors.background,
    '--color-foreground': t.colors.foreground,
    '--color-primary': t.colors.primary,
    '--color-primary-fg': t.colors.primaryForeground,
    '--color-accent': t.colors.accent,
    '--color-accent-fg': t.colors.accentForeground,
    '--color-muted': t.colors.muted,
    '--color-muted-fg': t.colors.mutedForeground,
    '--color-border': t.colors.border,
    '--font-body': t.fonts.body,
    '--font-heading': t.fonts.heading,
    '--radius': t.radius,
  } as CSSProperties;
}
