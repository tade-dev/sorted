import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';
import type { Env } from './env.js';
import type { TokenVerifier } from './lib/auth.js';

export function initFirebase(env: Env): { db: Firestore; auth: Auth } {
  if (getApps().length === 0) {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    initializeApp({
      projectId: env.FIREBASE_PROJECT_ID,
      credential: json ? cert(JSON.parse(json)) : applicationDefault(),
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
