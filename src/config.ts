const env = import.meta.env;

const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Scinai's Microsoft Entra app registration ("Scinai Maintenance").
 * These IDs are not secrets: a browser app has no secret, and access is
 * granted only to a user who signs in with their own work account. */
const DEFAULT_CLIENT_ID = '85bc0418-f30d-483e-9eeb-fc04682ce3a9';
const DEFAULT_TENANT_ID = '98944576-fbe3-4007-8f32-200ac12ad676';

export const config = {
  msClientId: clean(env.VITE_MS_CLIENT_ID) ?? DEFAULT_CLIENT_ID,
  msTenantId: clean(env.VITE_MS_TENANT_ID) ?? DEFAULT_TENANT_ID,
};

/** True when the app can sign in with Microsoft (storage in OneDrive + Outlook). */
export const microsoftConfigured = !!config.msClientId;
export const outlookConfigured = microsoftConfigured;

/** Absolute URL of the folder the app is served from (works under any GitHub Pages subpath). */
export const appUrl = () => new URL('./', window.location.href.split('#')[0].split('?')[0]).href;

/** Microsoft sign-in only works from a web address, not a double-clicked file. */
export const canSignIn = () => window.location.protocol === 'https:' || window.location.hostname === 'localhost';
