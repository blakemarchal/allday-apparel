import type { Metadata, Viewport } from 'next';
import { Inter, Fraunces, Anton } from 'next/font/google';
import { getCurrentStorefront, isAdminRequest } from '@/lib/storefront';
import { ADMIN_THEME, DEFAULT_THEME, getThemeForStorefront, themeStyleVars } from '@/lib/theme';
import './globals.css';

// Self-hosted at build time, no layout shift. Exposed as CSS variables so the
// per-storefront theme tokens can reference them (apparel → Fraunces serif,
// character → Anton condensed display, both bodied in Inter).
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' });
const anton = Anton({ subsets: ['latin'], weight: '400', variable: '--font-anton', display: 'swap' });

export const metadata: Metadata = {
  title: 'Allday Merch',
  description: 'Multi-storefront merchandise platform',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let theme = DEFAULT_THEME;
  if (await isAdminRequest()) {
    theme = ADMIN_THEME;
  } else {
    const storefront = await getCurrentStorefront();
    if (storefront) theme = await getThemeForStorefront(storefront.id);
  }

  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${anton.variable}`}>
      <body style={themeStyleVars(theme)}>{children}</body>
    </html>
  );
}
