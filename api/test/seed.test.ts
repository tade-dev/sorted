import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { bootstrapSeller } from '../src/domain/seed.js';
import { applyDelta, sumMinor } from '../src/domain/money.js';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
// Without this the Admin SDK probes the GCE metadata server for credentials it
// will never need against the emulator, and logs a MetadataLookupWarning that
// would mask real errors in CI output.
process.env.METADATA_SERVER_DETECTION = 'none';

let db: Firestore;

beforeAll(() => {
  if (getApps().length === 0) {
    initializeApp({ projectId: 'sorted-seed-test' });
  }
  db = getFirestore();
});

beforeEach(async () => {
  const sellers = await db.collection('sellers').listDocuments();
  await Promise.all(sellers.map((s) => db.recursiveDelete(s)));
});

async function productNamed(name: string) {
  const snap = await db
    .collection('sellers/seller-a/products')
    .where('name', '==', name)
    .get();
  return snap.docs[0]!.data();
}

describe('bootstrapSeller', () => {
  it('creates the seller and seeds the demo catalogue', async () => {
    const result = await bootstrapSeller(db, 'seller-a', { demo: true });
    expect(result.seller.displayName).toBe("Ola's Bakehouse");
    expect(result.seller.currency).toBe('GBP');
    expect(result.seededProducts).toBe(5);

    const products = await db.collection('sellers/seller-a/products').get();
    expect(products.size).toBe(5);
  });

  it('stores prices as integer pence, not floats', async () => {
    await bootstrapSeller(db, 'seller-a', { demo: true });
    const product = await productNamed('Lemon drizzle cake');
    expect(product.basePriceMinor).toBe(3200);
    expect(Number.isInteger(product.basePriceMinor)).toBe(true);
    const tenInch = product.variants.find((v: { label: string }) => v.label === '10 inch');
    expect(tenInch.priceDeltaMinor).toBe(1000);
  });

  it('reproduces the £56 demo order the design screens show', async () => {
    // Lemon drizzle 10 inch (£42) + brownie box of 6 (£14) = £56.00, the
    // total printed on Welcome, Draft, Orders and Paid. If this fails the
    // seed has drifted from docs/design/screens.
    await bootstrapSeller(db, 'seller-a', { demo: true });
    const cake = await productNamed('Lemon drizzle cake');
    const brownies = await productNamed('Brownie box');

    const tenInch = cake.variants.find((v: { label: string }) => v.label === '10 inch');
    const boxOfSix = brownies.variants.find((v: { label: string }) => v.label === 'Box of 6');

    const cakeLine = applyDelta(cake.basePriceMinor, tenInch.priceDeltaMinor);
    const brownieLine = applyDelta(brownies.basePriceMinor, boxOfSix.priceDeltaMinor);

    expect(cakeLine).toBe(4200);
    expect(brownieLine).toBe(1400);
    expect(sumMinor([cakeLine, brownieLine])).toBe(5600);
  });

  it('stores the product-level deposit for the celebration cake', async () => {
    await bootstrapSeller(db, 'seller-a', { demo: true });
    const cake = await productNamed('Custom celebration cake');
    expect(cake.basePriceMinor).toBe(5500);
    expect(cake.depositMinor).toBe(2000);
  });

  it('leaves depositMinor null for products without one', async () => {
    await bootstrapSeller(db, 'seller-a', { demo: true });
    expect((await productNamed('Brownie box')).depositMinor).toBeNull();
  });

  it('is idempotent: a second call does not duplicate products', async () => {
    // A judge reloading the hosted web build calls bootstrap again.
    await bootstrapSeller(db, 'seller-a', { demo: true });
    const second = await bootstrapSeller(db, 'seller-a', { demo: true });

    expect(second.seededProducts).toBe(0);
    const products = await db.collection('sellers/seller-a/products').get();
    expect(products.size).toBe(5);
  });

  it('is idempotent under concurrency, not just in sequence', async () => {
    // A judge double-tapping during a Render cold start fires two bootstraps
    // before either finishes. Read-then-write without a transaction lets both
    // see demoSeeded=false and both seed, leaving a doubled catalogue that
    // makes every later DM match ambiguous.
    await Promise.all([
      bootstrapSeller(db, 'seller-a', { demo: true }),
      bootstrapSeller(db, 'seller-a', { demo: true }),
    ]);

    const products = await db.collection('sellers/seller-a/products').get();
    expect(products.size).toBe(5);
  });

  it('creates a bare seller when demo is false', async () => {
    const result = await bootstrapSeller(db, 'seller-b', { demo: false });
    expect(result.seededProducts).toBe(0);
    expect(result.seller.demoSeeded).toBe(false);
    const products = await db.collection('sellers/seller-b/products').get();
    expect(products.size).toBe(0);
  });

  it('gives every variant a stable slug id', async () => {
    await bootstrapSeller(db, 'seller-a', { demo: true });
    const ids = (await productNamed('Brownie box')).variants.map(
      (v: { id: string }) => v.id,
    );
    expect(ids).toEqual(['box-of-6', 'box-of-12']);
  });
});
