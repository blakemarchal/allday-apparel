import 'server-only';
import type { CSSProperties } from 'react';
import { eq } from 'drizzle-orm';
import { db } from '@allday/db';
import { themeConfig } from '@allday/db/schema';

/**
 * Theme tokens, stored per-storefront as jsonb on theme_config.tokens and
 * projected onto CSS custom properties on <body>. Font values reference the
 * next/font CSS variables defined on <html> in layout.tsx (e.g.
 * "var(--font-fraunces), serif"), so swapping a store's typeface is a token
 * edit — no code change.
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

const SANS = 'var(--font-inter), system-ui, -apple-system, sans-serif';

/** Fallback for unconfigured hosts / missing rows. */
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
  fonts: { body: SANS, heading: SANS },
  radius: '0.375rem',
};

/** Admin chrome — neutral with a trust-signal blue. No DB row (admin has no storefront). */
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
  fonts: { body: SANS, heading: SANS },
  radius: '0.375rem',
};

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

/**
 * Landing hero content, stored per-storefront on theme_config.landing as
 * { hero: { ... } }. Lets us give each store real brand voice without code.
 */
export type LandingHero = {
  eyebrow: string;
  headline: string;
  sub: string;
  ctaLabel: string;
};

const DEFAULT_HERO: LandingHero = {
  eyebrow: '',
  headline: '',
  sub: '',
  ctaLabel: 'Shop',
};

export async function getLandingHero(storefrontId: string): Promise<LandingHero> {
  const [row] = await db
    .select({ landing: themeConfig.landing })
    .from(themeConfig)
    .where(eq(themeConfig.storefrontId, storefrontId))
    .limit(1);
  const hero = (row?.landing as { hero?: Partial<LandingHero> } | null)?.hero;
  return { ...DEFAULT_HERO, ...(hero ?? {}) };
}
