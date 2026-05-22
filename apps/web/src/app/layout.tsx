import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Allday Merch',
  description: 'Multi-storefront merchandise platform',
};

// Phone-first admin UX is a stated priority — disable user zoom shenanigans on
// admin pages later if needed, but allow it for storefronts.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
