import type { Config } from 'tailwindcss';

/**
 * Theme colors bridge to the CSS custom properties set on <body> by the
 * theme system (apps/web/src/lib/theme.ts). That keeps per-storefront
 * theming intact while admin components use the standard Tailwind class
 * names (`bg-primary`, `text-muted-foreground`, etc.).
 *
 * Hex values are used directly — no opacity modifiers on theme colors
 * (acceptable trade-off for v1; can switch to HSL triplets later if we
 * need bg-primary/50 patterns).
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        foreground: 'var(--color-foreground)',
        primary: {
          DEFAULT: 'var(--color-primary)',
          foreground: 'var(--color-primary-fg)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          foreground: 'var(--color-accent-fg)',
        },
        muted: {
          DEFAULT: 'var(--color-muted)',
          foreground: 'var(--color-muted-fg)',
        },
        border: 'var(--color-border)',
      },
      fontFamily: {
        sans: 'var(--font-body)',
        heading: 'var(--font-heading)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'calc(var(--radius) * 0.5)',
        lg: 'calc(var(--radius) * 1.5)',
      },
    },
  },
  plugins: [],
} satisfies Config;
