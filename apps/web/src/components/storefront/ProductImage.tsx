/**
 * Product image with a branded fallback. When `src` is set it fills its
 * (aspect-ratio'd) parent; when null it renders a clean placeholder tile in
 * the store's muted color showing the product name — never a broken image.
 *
 * Plain <img> (not next/image) on purpose: demo images are committed under
 * /public/demo and later swap to R2 URLs; no remote-domain config needed.
 */
export function ProductImage({
  src,
  alt,
}: {
  src: string | null | undefined;
  alt: string;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className="w-full h-full object-cover" />;
  }
  return (
    <div className="w-full h-full flex items-center justify-center bg-muted">
      <span className="font-heading text-muted-foreground text-center px-4 leading-tight">
        {alt}
      </span>
    </div>
  );
}
