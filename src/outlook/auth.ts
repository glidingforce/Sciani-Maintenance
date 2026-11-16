import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
} from '@azure/msal-browser';
import { appUrl, config, outlookConfigured } from '../config';

/** Delegated permission only: the signed-in user's own calendar. */
export const SCOPES = ['Calendars.ReadWrite'];

export class SignInRequired extends Error {}

let pca: PublicClientApplication | null = null;
let ready: Promise<AccountInfo | null> | null = null;

/** Initializes MSAL once and completes a returning redirect sign-in.
 * Uses the authorization-code flow with PKCE for public clients; no client secret exists. */
export function initOutlookAuth(): Promise<AccountInfo | null> {
  if (!outlookConfigured) return Promise.resolve(null);
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
  await initOutlookAuth();
  await pca!.loginRedirect({ scopes: SCOPES, prompt: 'select_account' });
}

export async function signOut(): Promise<void> {
  await initOutlookAuth();
  const account = pca!.getActiveAccount();
  // Clears this app's Microsoft tokens without signing the user out of Microsoft everywhere.
  if (account) await pca!.clearCache({ account });
}

export async function getToken(): Promise<string> {
  const account = await initOutlookAuth();
  if (!pca || !account) throw new SignInRequired('Not signed in to Outlook');
  try {
    const r = await pca.acquireTokenSilent({ scopes: SCOPES, account });
    return r.accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) throw new SignInRequired('Outlook sign-in expired');
    throw e;
  }
}

export function currentAccount(): AccountInfo | null {
  return pca?.getActiveAccount() ?? null;
}
