const env = import.meta.env;

const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export const config = {
  supabaseUrl: clean(env.VITE_SUPABASE_URL),
  supabaseAnonKey: clean(env.VITE_SUPABASE_ANON_KEY),
  msClientId: clean(env.VITE_MS_CLIENT_ID),
  msTenantId: clean(env.VITE_MS_TENANT_ID) ?? 'organizations',
};

export const supabaseConfigured = !!(config.supabaseUrl && config.supabaseAnonKey);
export const outlookConfigured = !!config.msClientId;

/** Absolute URL of the deployed app root (works under a GitHub Pages subpath). */
export const appUrl = () => new URL(import.meta.env.BASE_URL, window.location.origin).href;
