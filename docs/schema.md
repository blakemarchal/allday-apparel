# Allday Merch — Proposed Schema

**Status:** Draft for review. Sign-off required before Drizzle implementation.

This document is the canonical source for the v1 schema design. It captures table shape, relationships, indices, and the reservation lifecycle. Open questions are flagged inline.

---

## Diagram (textual)

```
storefront ──< storefront_host
storefront ──< theme_config (1:1)
storefront ──< product ──< variant
                 │
                 ├──< product_option ──< product_option_value
                 │
variant ──< variant_option_value >── product_option_value   (the matrix)
variant ── inventory_item (1:1)

storefront ──< drop ──< drop_allocation >── variant

storefront ──< order ──< order_line_item
order >── customer  (nullable; guest checkout = NULL)
order >── reservation  (1:1 at checkout-session creation; status transitions to consumed/released)

stripe_webhook_event   (standalone, for idempotency)

variant ──< stock_receipt   (inventory investment log; powers "total invested" + suggested cost)
invoice_upload ──< stock_receipt   (optional FK; receipts created via OCR'd invoice trace back here)

order ── payout_accrual          (one per paid order; % of net margin owed to Blake)
payout_accrual >── payout_disbursement   (closes accruals when Blake actually gets paid)
```

---

## Tables

### `storefront`

Tenancy anchor. Two rows at launch.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `slug` | text UNIQUE | e.g. `apparel`, `character` |
| `name` | text | Display name |
| `currency` | text | `'USD'` at launch |
| `free_shipping_threshold_cents` | int NULL | Free over this; flat below |
| `flat_shipping_cents` | int NULL | |
| `created_at`, `updated_at` | timestamptz | |

### `storefront_host`

Routes hostname → storefront. Lets us flip subdomain ↔ custom domain without a code change.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `storefront_id` | uuid FK | |
| `hostname` | text UNIQUE | e.g. `apparel.<root>`, `character.<root>`, eventually full custom domains |
| `is_primary` | bool | Used for canonical URLs / SEO |
| `created_at` | timestamptz | |

### `theme_config`

Per-storefront theme tokens + landing copy.

| Column | Type | Notes |
|---|---|---|
| `storefront_id` | uuid PK FK | One row per storefront |
| `tokens` | jsonb | Color, type, spacing, radii |
| `landing` | jsonb | Hero copy, featured product IDs, etc. |
| `updated_at` | timestamptz | |

### `product`

A purchasable product belongs to one storefront. (Disjoint catalogs at v1.)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `storefront_id` | uuid FK | |
| `slug` | text | UNIQUE per storefront |
| `title` | text | |
| `description` | text | Markdown allowed |
| `status` | enum | `draft`, `published`, `archived` |
| `created_at`, `updated_at` | timestamptz | |

Index: `(storefront_id, status)` for catalog list queries.

### `product_option`

Option dimensions on a product. E.g. for a tee: rows for `Size` and `Color`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `product_id` | uuid FK | |
| `name` | text | `'Size'`, `'Color'` |
| `position` | int | Display order |

### `product_option_value`

Allowed values for an option.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `product_option_id` | uuid FK | |
| `value` | text | `'M'`, `'Red'` |
| `position` | int | |

UNIQUE `(product_option_id, value)`.

### `variant`

A specific combination of option values, with its own SKU, price, and Stripe linkage.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `product_id` | uuid FK | |
| `sku` | text | UNIQUE per product |
| `price_cents` | int | |
| `weight_grams` | int NULL | For label generation |
| `cost_cents` | int NULL | Current unit cost (manually maintained; admin suggests value from latest stock_receipt). Used for live margin calc and snapshotted to `order_line_item.unit_cost_cents_snapshot` at sale time. |
| `stripe_product_id` | text NULL | Synced on publish |
| `stripe_price_id` | text NULL | Synced on publish; new row if price changes |
| `status` | enum | `draft`, `published`, `archived` |
| `created_at`, `updated_at` | timestamptz | |

Index: `(product_id, status)`. `stripe_price_id` looked up at checkout.

### `variant_option_value`

Join table: which option values define a variant.

| Column | Type | Notes |
|---|---|---|
| `variant_id` | uuid FK | |
| `product_option_value_id` | uuid FK | |

PK: `(variant_id, product_option_value_id)`.

### `stock_receipt`

Inventory investment log. One row per batch of units received. The truth source for "total invested" reporting and for suggested cost on the variant.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `variant_id` | uuid FK | |
| `qty_received` | int | |
| `unit_cost_cents` | int | What we paid per unit on this batch |
| `total_cost_cents` | int | Total for the batch — includes freight/duty/markup if applicable. Not necessarily `qty_received * unit_cost_cents`. |
| `vendor` | text NULL | |
| `reference` | text NULL | PO number, supplier order #, etc. |
| `received_at` | timestamptz | When the inventory landed |
| `notes` | text NULL | |
| `created_at` | timestamptz | |

**Side effect on insert:** `inventory_item.qty_on_hand` is incremented by `qty_received` (same transaction). `variant.cost_cents` is *not* auto-updated — admin shows latest receipt cost as a one-tap-to-apply suggestion. Manual sync keeps surprises out.

Index: `(variant_id, received_at DESC)` for the "latest receipt" lookup.

Additional column for invoice-driven receipts: `source_invoice_upload_id uuid FK NULL` — populated when this receipt was created from an OCR'd invoice. Lets admin click through from receipt → original invoice image.

### `invoice_upload`

OCR-based invoice ingestion. Will (or Blake) uploads an invoice photo/PDF; a BullMQ worker calls Claude API to extract structured fields; admin reviews and applies as a set of `stock_receipt` rows.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `r2_key` | text | Path in the R2 bucket: `invoices/{yyyy}/{mm}/{id}-{filename}` |
| `original_filename` | text | |
| `content_type` | text | `image/jpeg`, `image/png`, `application/pdf` |
| `file_size_bytes` | int | |
| `file_sha256` | text NULL | Indexed (not unique). Admin UI surfaces possible duplicates; doesn't block them — invoices legitimately get re-sent. |
| `source` | enum | `manual_upload`, `email_inbound`, `api`. `email_inbound` covers the Cowork feeder pipeline (Proton/Gmail-routed → R2 → merch). |
| `uploaded_by` | text NULL | Supabase user id when source=manual_upload; NULL for inbound automation |
| `status` | enum | `uploaded`, `extracting`, `extracted`, `applied`, `rejected`, `failed` |
| `vendor_extracted` | text NULL | |
| `invoice_date_extracted` | date NULL | |
| `invoice_number_extracted` | text NULL | |
| `total_cents_extracted` | int NULL | |
| `currency_extracted` | text NULL | ISO code; defaults USD |
| `extraction_payload` | jsonb NULL | Full structured extraction including line items array |
| `extraction_model` | text NULL | Model id used (so we can re-run if a better model lands) |
| `extraction_error` | text NULL | Set if extraction failed |
| `notes` | text NULL | Admin notes |
| `created_at`, `updated_at` | timestamptz | |
| `reviewed_at` | timestamptz NULL | When admin opened the review UI |
| `applied_at` | timestamptz NULL | When admin clicked Apply and stock_receipts were created |

`extraction_payload` shape (target):
```json
{
  "vendor": "Acme Apparel Co",
  "invoice_date": "2026-05-22",
  "invoice_number": "INV-12345",
  "total_cents": 18500,
  "currency": "USD",
  "line_items": [
    {
      "description": "Black tee, M",
      "sku_or_part_number": "TEE-BLK-M",
      "quantity": 24,
      "unit_cost_cents": 450,
      "line_total_cents": 10800
    }
  ]
}
```

Indices: `(status, created_at DESC)` for the admin "needs review" queue; `(file_sha256)` for duplicate-detection lookups.

### `inventory_item`

One row per variant. Reservation system math lives here.

| Column | Type | Notes |
|---|---|---|
| `variant_id` | uuid PK FK | |
| `qty_on_hand` | int | Physical units present |
| `qty_reserved` | int | Held by in-flight checkouts. Available = `qty_on_hand - qty_reserved`. |
| `low_stock_threshold` | int | For admin alerts |
| `updated_at` | timestamptz | |

CHECK: `qty_reserved >= 0`, `qty_on_hand >= 0`, `qty_reserved <= qty_on_hand`.

### `drop`

A limited release with optional time-window and/or quantity cap.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `storefront_id` | uuid FK | |
| `slug` | text | UNIQUE per storefront |
| `name` | text | |
| `starts_at` | timestamptz NULL | NULL = manually flipped live |
| `ends_at` | timestamptz NULL | NULL = open-ended |
| `quantity_cap` | int NULL | Total units across all allocations; NULL = uncapped |
| `per_customer_cap` | int NULL | Max units per customer (anti-scalper) |
| `status` | enum | `draft`, `scheduled`, `live`, `ended` |
| `created_at`, `updated_at` | timestamptz | |

State transitions are driven by a queued scheduler that watches `starts_at` / `ends_at`.

### `drop_allocation`

Which variants are part of a drop and any drop-specific stock allocation.

| Column | Type | Notes |
|---|---|---|
| `drop_id` | uuid FK | |
| `variant_id` | uuid FK | |
| `allocated_qty` | int NULL | NULL = use full inventory_item.qty_on_hand |

PK: `(drop_id, variant_id)`.

### `customer`

Optional. Created opportunistically when an order is placed (we capture email anyway). Guest checkout = no separate row before order creation.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `email` | text | Indexed but not UNIQUE (a person might use multiple) |
| `stripe_customer_id` | text NULL | If Stripe creates one |
| `created_at` | timestamptz | |

### `order`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `storefront_id` | uuid FK | |
| `customer_id` | uuid FK NULL | Nullable for guests |
| `stripe_checkout_session_id` | text UNIQUE | |
| `stripe_payment_intent_id` | text NULL | Populated post-payment |
| `status` | enum | `pending`, `paid`, `fulfilled`, `cancelled`, `refunded`, `partially_refunded` |
| `subtotal_cents` | int | |
| `tax_cents` | int | |
| `shipping_cents` | int | |
| `total_cents` | int | |
| `currency` | text | `'USD'` |
| `shipping_address` | jsonb | Snapshot at order time |
| `billing_address` | jsonb | Snapshot at order time |
| `email_snapshot` | text | Snapshot at order time |
| `refunded_amount_cents` | int default 0 | |
| `refund_reason` | text NULL | |
| `stripe_fee_cents` | int NULL | Populated from Stripe BalanceTransaction post-charge. Until then, payout calc uses an estimate (2.9% + $0.30). |
| `shipping_label_cost_cents` | int NULL | What Will actually paid the carrier (Shippo/EasyPost), distinct from `shipping_cents` (what the customer was charged). |
| `created_at` | timestamptz | |
| `paid_at` | timestamptz NULL | |
| `fulfilled_at` | timestamptz NULL | |

Indices: `(storefront_id, created_at DESC)` for admin lists; `stripe_checkout_session_id UNIQUE` for webhook lookup.

### `order_line_item`

Immutable snapshot of what was ordered.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `order_id` | uuid FK | |
| `variant_id` | uuid FK | Reference (catalog can be edited; snapshots below are the truth) |
| `sku_snapshot` | text | |
| `title_snapshot` | text | `"Product Name — M / Red"` |
| `options_snapshot` | jsonb | `[{name: "Size", value: "M"}, ...]` |
| `qty` | int | |
| `unit_price_cents` | int | |
| `line_total_cents` | int | |
| `unit_cost_cents_snapshot` | int NULL | Cost basis at sale time (copied from `variant.cost_cents`). Nullable for orders placed before cost data was set. |

### `reservation`

Lifeblood of the drop concurrency story. One row per Stripe Checkout Session × variant line item.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `variant_id` | uuid FK | |
| `qty` | int | Units held |
| `stripe_checkout_session_id` | text | |
| `expires_at` | timestamptz | Matches Stripe session expiry (20 min) |
| `status` | enum | `held`, `consumed`, `released` |
| `created_at`, `updated_at` | timestamptz | |

Indices: `(stripe_checkout_session_id)`, `(expires_at) WHERE status = 'held'` (partial index for the sweeper).

### `stripe_webhook_event`

Idempotency log. Every received webhook lands here exactly once.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `stripe_event_id` | text UNIQUE | `evt_...` from Stripe |
| `event_type` | text | `'checkout.session.completed'`, etc. |
| `payload` | jsonb | The raw event |
| `received_at` | timestamptz | |
| `processed_at` | timestamptz NULL | |
| `error` | text NULL | If processing failed; retried via BullMQ |

The UNIQUE constraint on `stripe_event_id` is the idempotency seam. Webhook handler does `INSERT ON CONFLICT DO NOTHING`; if a row exists already, skip.

### `payout_accrual`

One row per paid order. Computed by the BullMQ worker when processing `checkout.session.completed`. Snapshots both the basis and the percentage so changing the rate later doesn't rewrite history.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `order_id` | uuid FK UNIQUE | One accrual per order |
| `gross_cents` | int | Snapshot of `order.subtotal_cents` |
| `cogs_cents` | int | Snapshot — sum of `order_line_item.unit_cost_cents_snapshot * qty`. May be 0 if cost data wasn't set yet. |
| `stripe_fee_cents` | int | Snapshot — actual from BalanceTransaction if available, else estimate (2.9% + $0.30) |
| `shipping_label_cost_cents` | int NULL | Snapshot at accrual time. NULL until label is purchased. May be retroactively updated if accrual is still `accrued`. |
| `net_margin_cents` | int | Computed: `gross - cogs - stripe_fee - COALESCE(shipping_label_cost, 0)`. Tax excluded (not Will's money). |
| `pct_basis_points_snapshot` | int | Rate at accrual time, in basis points (2000 = 20%). Source: `PARTNER_PAYOUT_PCT_BPS` env. |
| `amount_cents` | int | Computed: `net_margin_cents * pct_basis_points_snapshot / 10000`. |
| `status` | enum | `accrued`, `paid`, `voided` |
| `disbursement_id` | uuid FK NULL | Set when status flips to `paid`; points to the payout_disbursement row |
| `voided_reason` | text NULL | E.g. order refunded |
| `created_at`, `updated_at` | timestamptz | |

On order refund: matching accrual is marked `voided` with `voided_reason`. If it was already `paid`, that's a real-world reconciliation problem — surface it in admin, don't auto-claw-back.

### `payout_disbursement`

A payment from Will to Blake. Closes out one or more accruals.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `amount_cents` | int | What was paid |
| `method` | text | `'venmo'`, `'zelle'`, `'bank_transfer'`, etc. Free text. |
| `reference` | text NULL | Confirmation # or memo |
| `paid_at` | timestamptz | |
| `notes` | text NULL | |
| `created_at` | timestamptz | |

When a disbursement is created, admin assigns it to a set of `payout_accrual` rows (sets their `disbursement_id`, flips `status` to `paid`). Sum of those accruals should reconcile to `amount_cents`; admin flags discrepancies but doesn't enforce — real-world payments include rounding and partial settlements.

---

## Reservation lifecycle (the load-bearing piece)

```
[ Customer clicks Checkout ]
        │
        ▼
1. Server opens a SERIALIZABLE Postgres transaction:
   For each cart line:
     SELECT qty_on_hand, qty_reserved FROM inventory_item WHERE variant_id = ? FOR UPDATE
     IF qty_on_hand - qty_reserved < requested_qty: ROLLBACK, return "out of stock"
     UPDATE inventory_item SET qty_reserved = qty_reserved + requested_qty WHERE variant_id = ?
     INSERT INTO reservation (variant_id, qty, stripe_checkout_session_id, expires_at, status='held')
2. COMMIT.
3. Create Stripe Checkout Session with expires_at = NOW() + 20 min. Use the same value for the reservation's expires_at.
4. Redirect customer to Stripe Checkout.
        │
        ├──► [ Customer completes payment ]
        │       Webhook: checkout.session.completed
        │       Idempotency check on stripe_webhook_event
        │       Enqueue BullMQ job: consume-reservation
        │         For each reservation in session:
        │           UPDATE inventory_item SET qty_on_hand -= qty, qty_reserved -= qty
        │           UPDATE reservation SET status = 'consumed'
        │         Create order + line items (snapshot price, options, sku, AND cost_cents)
        │         INSERT payout_accrual (snapshot gross/cogs/fees/pct → amount)
        │         Enqueue confirmation email
        │
        ├──► [ Customer abandons / session expires ]
        │       Webhook: checkout.session.expired
        │       OR: periodic sweeper job (every 60s)
        │         For each reservation WHERE expires_at < NOW() AND status = 'held':
        │           UPDATE inventory_item SET qty_reserved -= qty
        │           UPDATE reservation SET status = 'released'
        │
        └──► [ Stripe webhook delivery fails entirely ]
                Reservation expires_at passes, sweeper releases it.
                Customer sees "session expired" on Stripe; can re-checkout.
```

Customer-facing availability: `qty_on_hand - qty_reserved` is what powers "X left" UI on a drop.

---

## Indices summary

- `storefront_host(hostname)` UNIQUE — middleware lookup on every request
- `product(storefront_id, status)` — catalog list
- `variant(product_id, status)` — variant list per product
- `variant(sku)` UNIQUE within product
- `inventory_item(variant_id)` PK — checkout, admin low-stock query
- `order(storefront_id, created_at DESC)` — admin order list
- `order(stripe_checkout_session_id)` UNIQUE — webhook handler lookup
- `reservation(stripe_checkout_session_id)` — webhook handler lookup
- `reservation(expires_at) WHERE status = 'held'` — sweeper (partial index)
- `stripe_webhook_event(stripe_event_id)` UNIQUE — idempotency
- `stock_receipt(variant_id, received_at DESC)` — latest-receipt lookup for admin cost suggestions
- `payout_accrual(order_id)` UNIQUE — one accrual per order
- `payout_accrual(status, created_at)` — admin "outstanding accruals" list
- `payout_accrual(disbursement_id)` — disbursement reconciliation
- `invoice_upload(status, created_at DESC)` — admin "needs review" queue
- `stock_receipt(source_invoice_upload_id)` — trace receipts to source invoice

---

## What this schema deliberately does NOT include (v1 scope guard)

- Coupons / discount codes (Stripe Checkout supports promotion codes natively if Will wants them later)
- Subscriptions
- Saved cards (guest checkout only)
- Multi-currency
- Wishlists / carts persisted server-side (cart is client-side until Checkout click)
- Product reviews / ratings
- Returns workflow (refund_amount + reason fields on order are enough for v1 manual handling)
- Marketplace features (third-party sellers, payouts, Connect)
- Fulfillment provider integrations beyond label-gen (POD/3PL deferred)
- RLS

---

## Open questions to confirm before implementation

1. **UUIDs vs bigint serial PKs?** I've drafted with UUID — opinions welcome. Bigint serial is faster + smaller indexes; UUID is friendlier for distributed scenarios and harder to enumerate from the URL. For v1 either works. **Lean: UUID.**
2. **Soft delete or status enum for products/variants?** Drafted as status enum (`draft`/`published`/`archived`). Sales history references survive archive. **Lean: status enum, no soft delete.**
3. **Address storage:** snapshotted as `jsonb` on the order. Acceptable, or do you want a structured `address` table with FK? **Lean: jsonb snapshot — addresses don't get queried, just displayed/printed.**
4. **Shipping rules:** v1 = two fields on Storefront (free threshold + flat rate). Sufficient, or do we need a `shipping_rule` table from the start? **Lean: two fields, refactor later.**
5. **Drop-specific inventory:** currently a `drop_allocation.allocated_qty NULL` (= use full variant inventory) vs `int` (= cap at this many for this drop). Confirm this is the shape you want vs. a simpler "drops just point to variants, no allocation cap."
6. **`tax_cents` source:** Stripe Tax returns it on the session — we snapshot whatever Stripe says. Confirm we're OK delegating tax math entirely to Stripe Tax.
