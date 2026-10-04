import { createClient } from '@supabase/supabase-js';

import { env } from '../env/api.js';

export const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);

export const storageBucket = env.supabaseStorageBucket;
