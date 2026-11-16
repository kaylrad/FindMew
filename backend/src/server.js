import { configuration } from './config.js';
import { createApp } from './app.js';
const config = configuration();
const { app, store } = await createApp(config);
const server = app.listen(config.port, '0.0.0.0', () =>
  console.log(
    `FindMew ${config.demo ? 'DEMO (local JSON, not Supabase)' : 'Supabase'}: http://localhost:${config.port}`
  )
);
let cleaning = false;
const clean = async () => {
  if (cleaning) return;
  cleaning = true;
  try {
    await store.cleanup();
  } catch {
    console.error('Storage cleanup pending; it will retry.');
  } finally {
    cleaning = false;
  }
};
clean();
const timer = setInterval(clean, 60000);
timer.unref();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    clearInterval(timer);
    server.close(() => process.exit(0));
  });
