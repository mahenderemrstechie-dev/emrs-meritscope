// Public browser config only. Supabase publishable/anon key is designed for frontend use
// when Row Level Security is enabled. Never place a service-role key or DB password here.
export const environment = {
  production: false,
  supabaseUrl: 'https://vrvfdanppwbcsdjheswe.supabase.co',
  supabaseKey: 'REPLACE_WITH_YOUR_SUPABASE_PUBLISHABLE_KEY'
};
