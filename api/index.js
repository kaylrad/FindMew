import { createApp } from '../backend/src/app.js';
import { configuration } from '../backend/src/config.js';
import { createServerlessHandler } from '../backend/src/serverless.js';

export default createServerlessHandler(async () => {
  const config = configuration();
  if (config.demo) throw new Error('Hosted FindMew requires Supabase.');
  return (await createApp(config, { serveFrontend: false })).app;
});
