import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
} from '@azure/msal-browser';
import { appUrl, canSignIn, config, microsoftConfigured } from '../config';

/** Delegated permissions only, requested together so you consent once:
 * your own calendar, and this app's private folder in your OneDrive. */
export const SCOPES = ['Calendars.ReadWrite', 'Files.ReadWrite.AppFolder'];

export class SignInRequired extends Error {}

let pca: PublicClientApplication | null = null;
let ready: Promise<AccountInfo | null> | null = null;

/** Initializes MSAL once and completes a returning sign-in redirect.
 * Public client with PKCE: there is no client secret anywhere. */
export function initAuth(): Promise<AccountInfo | null> {
  if (!microsoftConfigured || !canSignIn()) return Promise.resolve(null);
  if (ready) return ready;
  ready = (async () => {
    pca = new PublicClientApplication({
      auth: {
        clientId: config.msClientId!,
        authority: `https://login.microsoftonline.com/${config.msTenantId}`,
        redirectUri: appUrl(),
      },
      cache: { cacheLocation: 'localStorage' },
    });
    await pca.initialize();
    const result = await pca.handleRedirectPromise();
    if (result?.account) pca.setActiveAccount(result.account);
    const account = pca.getActiveAccount() ?? pca.getAllAccounts()[0] ?? null;
    if (account) pca.setActiveAccount(account);
    return account;
  })();
  return ready;
}

/** Full-page redirect: reliable on iPhone Safari and home-screen apps, where popups are not. */
export async function signIn(): Promise<void> {
  await initAuth();
  if (!pca) throw new Error('Microsoft sign-in is not available here.');
  await pca.loginRedirect({ scopes: SCOPES, prompt: 'select_account' });
}

/** Forgets this app's tokens on this device (does not sign you out of Microsoft elsewhere). */
export async function signOut(): Promise<void> {
  await initAuth();
  const account = pca?.getActiveAccount();
  if (pca && account) await pca.clearCache({ account });
}

export async function getToken(): Promise<string> {
  const account = await initAuth();
  if (!pca || !account) throw new SignInRequired('Not signed in to Microsoft');
  try {
    const r = await pca.acquireTokenSilent({ scopes: SCOPES, account });
    return r.accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) throw new SignInRequired('Microsoft sign-in expired');
    throw e;
  }
}

export function currentAccount(): AccountInfo | null {
  return pca?.getActiveAccount() ?? null;
}
