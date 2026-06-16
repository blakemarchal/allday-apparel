'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney } from '@/lib/money';
import { addToCartAction } from './actions';

type Variant = {
  id: string;
  sku: string;
  priceCents: number;
  available: number;
};

/**
 * Variant selector + add-to-cart. Takes the resolved storefrontId and basePath
 * so it adds to the correct store's cart and routes to that store's cart page.
 * Proper Size × Color matrix UI lands with #22; for now variants are buttons.
 */
export function PdpAddToCart({
  storefrontId,
  basePath,
  variants,
  currency,
}: {
  storefrontId: string;
  basePath: string;
  variants: Variant[];
  currency: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? '');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selected = variants.find((v) => v.id === selectedId);
  if (!selected) return null;
  const soldOut = selected.available <= 0;

  const onAdd = (): void => {
    setError(null);
    startTransition(async () => {
      const result = await addToCartAction(storefrontId, selected.id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.push(`${basePath}/cart`);
    });
  };

  return (
    <div>
      {variants.length > 1 && (
        <div className="mb-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Variant</p>
          <div className="grid grid-cols-2 gap-2">
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedId(v.id)}
                className={`text-left px-3 py-2 rounded border ${
                  v.id === selectedId ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
                }`}
              >
                <div className="font-mono text-xs">{v.sku}</div>
                <div className="text-sm font-medium tabular-nums mt-0.5">
                  {formatMoney(v.priceCents, currency)}
                </div>
                {v.available <= 0 && <div className="text-xs text-muted-foreground mt-0.5">Sold out</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-baseline justify-between mb-3">
        <span className="text-3xl font-heading font-bold tabular-nums">
          {formatMoney(selected.priceCents, currency)}
        </span>
        <span className="text-xs text-muted-foreground">
          {soldOut ? 'Sold out' : `${selected.available} available`}
        </span>
      </div>

      <button
        type="button"
        onClick={onAdd}
        disabled={pending || soldOut}
        className="w-full bg-primary text-primary-foreground rounded px-4 py-3 font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? 'Adding…' : soldOut ? 'Sold out' : 'Add to cart'}
      </button>

      {error && (
        <p className="mt-3 text-sm text-muted-foreground">
          <strong className="text-foreground">Couldn&apos;t add:</strong> {error}
        </p>
      )}
    </div>
  );
}
