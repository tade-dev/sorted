import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'sorted-rules-test',
    firestore: {
      rules: readFileSync('../firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('firestore rules', () => {
  it('lets a seller read their own document', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sellers/seller-a'), { displayName: 'A' });
    });
    const db = testEnv.authenticatedContext('seller-a').firestore();
    await assertSucceeds(getDoc(doc(db, 'sellers/seller-a')));
  });

  it('lets a seller read their own order', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'sellers/seller-a/orders/o1'), { status: 'draft' });
    });
    const db = testEnv.authenticatedContext('seller-a').firestore();
    await assertSucceeds(getDoc(doc(db, 'sellers/seller-a/orders/o1')));
  });

  it("denies reading another seller's data", async () => {
    const db = testEnv.authenticatedContext('seller-b').firestore();
    await assertFails(getDoc(doc(db, 'sellers/seller-a')));
  });

  it('denies an unauthenticated read', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'sellers/seller-a')));
  });

  it('denies a client writing their own seller document', async () => {
    const db = testEnv.authenticatedContext('seller-a').firestore();
    await assertFails(setDoc(doc(db, 'sellers/seller-a'), { displayName: 'hacked' }));
  });

  it('denies a client writing their own order', async () => {
    const db = testEnv.authenticatedContext('seller-a').firestore();
    await assertFails(setDoc(doc(db, 'sellers/seller-a/orders/o2'), { status: 'paid' }));
  });

  it('denies client reads of the webhookEvents ledger', async () => {
    const db = testEnv.authenticatedContext('seller-a').firestore();
    await assertFails(getDoc(doc(db, 'webhookEvents/evt-1')));
  });

  it('denies client writes to the webhookEvents ledger', async () => {
    const db = testEnv.authenticatedContext('seller-a').firestore();
    await assertFails(setDoc(doc(db, 'webhookEvents/evt-1'), { handled: true }));
  });
});
