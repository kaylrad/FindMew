import { configuration } from './config.js';
import { SupabaseStore } from './services/supabase.js';
const config = configuration();
if (config.demo) {
  console.log('No Supabase Storage in demo mode.');
} else {
  const store = await new SupabaseStore(config).init();
  console.log(await store.cleanup());
}
