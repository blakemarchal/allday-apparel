import { pgTable, uuid, text, integer, jsonb, timestamp, date, index } from 'drizzle-orm/pg-core';
import { invoiceUploadStatusEnum, invoiceUploadSourceEnum } from './enums';

// OCR-driven invoice ingestion. Will (or Blake, or the Cowork email feeder)
// uploads an invoice → BullMQ worker calls Claude API for structured extraction
// → admin reviews + applies as a set of stock_receipt rows.
export const invoiceUpload = pgTable(
  'invoice_upload',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // R2 storage.
    r2Key: text('r2_key').notNull(),
    originalFilename: text('original_filename').notNull(),
    contentType: text('content_type').notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),

    // Dedup hint — indexed but not unique. Real invoices legitimately get re-sent
    // (vendor reminders, etc.); the admin UI flags duplicates without blocking them.
    fileSha256: text('file_sha256'),

    // Provenance.
    source: invoiceUploadSourceEnum('source').notNull().default('manual_upload'),
    uploadedBy: text('uploaded_by'), // Supabase user id for manual uploads; NULL for automation

    // Pipeline status.
    status: invoiceUploadStatusEnum('status').notNull().default('uploaded'),

    // Extracted fields (top-level convenience; full extraction in payload).
    vendorExtracted: text('vendor_extracted'),
    invoiceDateExtracted: date('invoice_date_extracted'),
    invoiceNumberExtracted: text('invoice_number_extracted'),
    totalCentsExtracted: integer('total_cents_extracted'),
    currencyExtracted: text('currency_extracted'),

    // Full structured extraction including line items array.
    extractionPayload: jsonb('extraction_payload'),
    extractionModel: text('extraction_model'),
    extractionError: text('extraction_error'),

    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
  },
  (t) => [
    index('invoice_upload_status_created_at_idx').on(t.status, t.createdAt),
    index('invoice_upload_sha256_idx').on(t.fileSha256),
  ],
);
