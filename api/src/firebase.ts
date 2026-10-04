import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';
import type { Env } from './env.js';
import type { TokenVerifier } from './lib/auth.js';

/**
 * Reads the service-account JSON from the environment.
 *
 * Returns null when unset or blank, so the caller falls back to Application
 * Default Credentials. A non-blank value that is not valid JSON is a
 * misconfiguration worth failing on, but it fails with a message naming the
 * variable rather than a bare SyntaxError from deep inside startup — a
 * placeholder like "pending" pasted into a hosting dashboard is the likely
 * cause and the error should say so.
 */
export function parseServiceAccount(raw: string | undefined): object | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as object;
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON. ' +
        'Paste the whole service-account file as a single line, or leave the ' +
        'variable empty to use Application Default Credentials.',
    );
  }
}

export function initFirebase(env: Env): { db: Firestore; auth: Auth } {
  if (getApps().length === 0) {
    const serviceAccount = parseServiceAccount(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    );
    initializeApp({
      projectId: env.FIREBASE_PROJECT_ID,
      credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
    });
  }
  return { db: getFirestore(), auth: getAuth() };
}

export function adminTokenVerifier(auth: Auth): TokenVerifier {
  return async (token) => {
    const decoded = await auth.verifyIdToken(token);
    return { uid: decoded.uid };
  };
}
