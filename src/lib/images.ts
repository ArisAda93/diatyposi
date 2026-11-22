/**
 * Resolves image file names (as written in src/data/site.ts) to optimised Astro image metadata.
 * To add work: drop the file into src/assets/portfolio/ and reference its file name.
 */
import type { ImageMetadata } from 'astro';

const files = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/portfolio/*.{jpg,jpeg,png,webp,avif}',
  { eager: true },
);

export const getImage = (fileName: string): ImageMetadata => {
  const entry = files[`/src/assets/portfolio/${fileName}`];
  if (!entry) {
    throw new Error(
      `Image "${fileName}" not found in src/assets/portfolio/. Check the file name in src/data/site.ts.`,
    );
  }
  return entry.default;
};
