'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@allday/db';
import { product } from '@allday/db/schema';
import { requireAdmin } from '@/lib/admin-user';

function err(msg: string): never {
  redirect(`/admin/products/new?error=${encodeURIComponent(msg)}`);
}

export async function createProduct(formData: FormData): Promise<void> {
  await requireAdmin();

  const storefrontId = formData.get('storefrontId');
  const title = formData.get('title');
  const slug = formData.get('slug');
  const description = formData.get('description');

  if (typeof storefrontId !== 'string' || !storefrontId) err('Pick a storefront.');
  if (typeof title !== 'string' || !title.trim()) err('Title is required.');
  if (typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
    err('Slug must be lowercase letters, numbers, and hyphens.');
  }

  let newId: string;
  try {
    const [row] = await db
      .insert(product)
      .values({
        storefrontId: storefrontId as string,
        title: (title as string).trim(),
        slug: slug as string,
        description: typeof description === 'string' && description.trim() ? description.trim() : null,
        status: 'draft',
      })
      .returning({ id: product.id });
    if (!row) throw new Error('insert returned no row');
    newId = row.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    // Most likely cause: storefront_slug_unique violation.
    err(`Slug already in use for that storefront (${msg.slice(0, 80)})`);
  }

  revalidatePath('/admin/products');
  redirect(`/admin/products/${newId}`);
}
