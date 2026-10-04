import { createApp } from './app.js';
import { loadEnv } from './env.js';

const env = loadEnv();
createApp(env).listen(env.PORT, () => {
  console.log(`sorted api listening on :${env.PORT} (${env.PAYPAL_ENV})`);
});
