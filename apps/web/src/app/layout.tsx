import type { Metadata, Viewport } from 'next';
import { getCurrentStorefront, isAdminRequest } from '@/lib/storefront';
import {
  ADMIN_THEME,
  DEFAULT_THEME,
  getThemeForStorefront,
  themeStyleVars,
} from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Allday Merch',
  description: 'Multi-storefront merchandise platform',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolve the theme for this request:
  //   - admin.<host>          → ADMIN_THEME (no DB lookup)
  //   - known storefront host → theme_config row (or DEFAULT_THEME if unset)
  //   - unconfigured host     → DEFAULT_THEME
  let theme = DEFAULT_THEME;
  if (await isAdminRequest()) {
    theme = ADMIN_THEME;
  } else {
    const storefront = await getCurrentStorefront();
    if (storefront) {
      theme = await getThemeForStorefront(storefront.id);
    }
  }

  return (
    <html lang="en">
      <body style={themeStyleVars(theme)}>{children}</body>
    </html>
  );
}
