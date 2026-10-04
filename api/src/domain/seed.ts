import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { parseGbp, type Minor } from './money.js';

export type SeedVariant = { axis: string; label: string; priceDelta: string };
export type SeedProduct = {
  name: string;
  description: string;
  basePrice: string;
  /** Default deposit to book this item, e.g. the celebration cake's £20. */
  deposit: string | null;
  variants: SeedVariant[];
};
export type SeedFile = {
  seller: { displayName: string; personaTone: string; timezone: string };
  products: SeedProduct[];
};

export type SellerDoc = {
  id: string;
  displayName: string;
  personaTone: string;
  currency: 'GBP';
  timezone: string;
  demoSeeded: boolean;
};

const SEED_PATH = fileURLToPath(
  new URL('../../../samples/seed-catalogue.json', import.meta.url),
);

export function loadSeedFile(path: string = SEED_PATH): SeedFile {
  return JSON.parse(readFileSync(path, 'utf8')) as SeedFile;
}

export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Signed pence: variant deltas may legitimately be negative. */
function parseDelta(value: string): number {
  const negative = value.trim().startsWith('-');
  const magnitude: Minor = parseGbp(value.trim().replace(/^-/, ''));
  return negative ? -magnitude : magnitude;
}

export async function bootstrapSeller(
  db: Firestore,
  sellerId: string,
  opts: { demo: boolean },
): Promise<{ seller: SellerDoc; seededProducts: number }> {
  const sellerRef = db.doc(`sellers/${sellerId}`);
  const existing = await sellerRef.get();
  const seed = loadSeedFile();

  const alreadySeeded = existing.exists && existing.get('demoSeeded') === true;

  const seller: SellerDoc = {
    id: sellerId,
    displayName: opts.demo ? seed.seller.displayName : 'My shop',
    personaTone: opts.demo ? seed.seller.personaTone : '',
    currency: 'GBP',
    timezone: seed.seller.timezone,
    demoSeeded: opts.demo || alreadySeeded,
  };

  if (!existing.exists) {
    // demoSeeded stays false until the product batch commits, so a seed that
    // fails halfway cannot leave a seller that can never be seeded again.
    await sellerRef.set({
      ...seller,
      demoSeeded: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  if (!opts.demo || alreadySeeded) {
    return { seller, seededProducts: 0 };
  }

  const batch = db.batch();
  for (const product of seed.products) {
    const ref = db.collection(`sellers/${sellerId}/products`).doc();
    batch.set(ref, {
      id: ref.id,
      name: product.name,
      description: product.description,
      basePriceMinor: parseGbp(product.basePrice),
      depositMinor: product.deposit === null ? null : parseGbp(product.deposit),
      currency: 'GBP',
      photoUrl: null,
      variants: product.variants.map((v) => ({
        id: slugify(v.label),
        axis: v.axis,
        label: v.label,
        priceDeltaMinor: parseDelta(v.priceDelta),
        active: true,
      })),
      active: true,
      source: 'manual',
      aiConfidence: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  batch.set(sellerRef, { demoSeeded: true }, { merge: true });
  await batch.commit();

  return { seller, seededProducts: seed.products.length };
}
