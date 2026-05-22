'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '@allday/db';
import { drop } from '@allday/db/schema';
import { requireAdmin } from '@/lib/admin-user';

function err(msg: string): never {
  redirect(`/admin/drops/new?error=${encodeURIComponent(msg)}`);
}

export async function createDrop(formData: FormData): Promise<void> {
  await requireAdmin();
  const storefrontId = formData.get('storefrontId');
  const name = formData.get('name');
  const slug = formData.get('slug');

  if (typeof storefrontId !== 'string' || !storefrontId) err('Pick a storefront.');
  if (typeof name !== 'string' || !name.trim()) err('Name required.');
  if (typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
    err('Slug must be lowercase letters/numbers/hyphens.');
  }

  let newId: string;
  try {
    const [row] = await db
      .insert(drop)
      .values({
        storefrontId: storefrontId as string,
        name: (name as string).trim(),
        slug: slug as string,
        status: 'draft',
      })
      .returning({ id: drop.id });
    if (!row) throw new Error('insert returned no row');
    newId = row.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    err(`Slug already in use for that storefront (${msg.slice(0, 80)})`);
  }

  revalidatePath('/admin/drops');
  redirect(`/admin/drops/${newId}`);
}
