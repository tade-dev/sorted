import { createApp } from './app.js';
import { loadEnv } from './env.js';
import { adminTokenVerifier, initFirebase } from './firebase.js';

const env = loadEnv();
const { db, auth } = initFirebase(env);

createApp({ env, db, verify: adminTokenVerifier(auth) }).listen(env.PORT, () => {
  console.log(`sorted api listening on :${env.PORT} (${env.PAYPAL_ENV})`);
});
