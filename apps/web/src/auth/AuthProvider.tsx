import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ClientConfig } from '@power-quiz/shared';
import { loadClientConfig } from '../lib/config';

export type AuthStatus = 'idle' | 'loading' | 'signedOut' | 'signedIn' | 'error';

export interface AuthUser {
  name: string;
  username?: string;
}

export interface AuthContextValue {
  status: AuthStatus;
  mode: ClientConfig['authMode'] | null;
  user: AuthUser | null;
  error: string | null;
  /** Loads sign-in support on demand, so participants' phones never download MSAL. */
  activate(): void;
  signIn(options?: { devName?: string; returnTo?: string }): Promise<void>;
  signOut(): Promise<void>;
  getToken(): Promise<string>;
}

interface AuthBackend {
  mode: ClientConfig['authMode'];
  currentUser(): AuthUser | null;
  signIn(options: { devName?: string; returnTo?: string }): Promise<AuthUser | null>;
  signOut(): Promise<void>;
  getToken(): Promise<string>;
}

const DEV_USER_KEY = 'pq:devUser';

function createDevBackend(): AuthBackend {
  const read = () => {
    try {
      return localStorage.getItem(DEV_USER_KEY);
    } catch {
      return null;
    }
  };
  return {
    mode: 'dev',
    currentUser: () => {
      const name = read();
      return name ? { name } : null;
    },
    async signIn({ devName }) {
      const name = devName?.trim();
      if (!name) throw new Error('Enter a name to sign in.');
      localStorage.setItem(DEV_USER_KEY, name);
      return { name };
    },
    async signOut() {
      localStorage.removeItem(DEV_USER_KEY);
    },
    async getToken() {
      const name = read();
      if (!name) throw new Error('Please sign in again.');
      return `dev:${encodeURIComponent(name)}`;
    },
  };
}

async function createEntraBackend(entra: NonNullable<ClientConfig['entra']>): Promise<AuthBackend> {
  const msal = await import('@azure/msal-browser');
  const client = new msal.PublicClientApplication({
    auth: {
      clientId: entra.clientId,
      authority: `https://login.microsoftonline.com/${entra.tenantId}`,
      redirectUri: window.location.origin,
      postLogoutRedirectUri: window.location.origin,
    },
    // Shared across tabs so the big screen can open in its own window without signing in again.
    cache: { cacheLocation: 'localStorage' },
  });
  await client.initialize();
  const result = await client.handleRedirectPromise();
  const account = result?.account ?? client.getActiveAccount() ?? client.getAllAccounts()[0] ?? null;
  if (account) client.setActiveAccount(account);

  const scopes = [entra.scope];
  let redirecting = false;
  return {
    mode: 'entra',
    currentUser: () => {
      const active = client.getActiveAccount();
      return active ? { name: active.name ?? active.username, username: active.username } : null;
    },
    async signIn({ returnTo }) {
      await client.loginRedirect({ scopes, redirectStartPage: returnTo ?? window.location.href });
      return null;
    },
    async signOut() {
      await client.logoutRedirect({ account: client.getActiveAccount() ?? undefined });
    },
    async getToken() {
      const active = client.getActiveAccount();
      if (!active) throw new Error('Please sign in again.');
      try {
        // Use cached/refresh tokens only: hidden-iframe renewal cannot work with this app's CSP, so an
        // expired refresh token must surface as InteractionRequiredAuthError and trigger a redirect.
        const result = await client.acquireTokenSilent({
          scopes,
          account: active,
          cacheLookupPolicy: msal.CacheLookupPolicy.AccessTokenAndRefreshToken,
        });
        return result.accessToken;
      } catch (error) {
        if (error instanceof msal.InteractionRequiredAuthError && !redirecting) {
          redirecting = true;
          await client.acquireTokenRedirect({ scopes, account: active });
        }
        throw error;
      }
    },
  };
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Sign-in failed.');

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthState {
  status: AuthStatus;
  mode: ClientConfig['authMode'] | null;
  user: AuthUser | null;
  error: string | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'idle', mode: null, user: null, error: null });
  const backendRef = useRef<Promise<AuthBackend> | null>(null);

  const backend = useCallback(() => {
    backendRef.current ??= loadClientConfig().then((config) =>
      config.authMode === 'entra' && config.entra ? createEntraBackend(config.entra) : createDevBackend(),
    );
    return backendRef.current;
  }, []);

  const activate = useCallback(() => {
    setState((current) => (current.status === 'idle' ? { ...current, status: 'loading' } : current));
    backend().then(
      (ready) => {
        const user = ready.currentUser();
        setState({ status: user ? 'signedIn' : 'signedOut', mode: ready.mode, user, error: null });
      },
      (error: unknown) => {
        backendRef.current = null;
        setState({ status: 'error', mode: null, user: null, error: errorMessage(error) });
      },
    );
  }, [backend]);

  // Coming back from the Microsoft sign-in page: process the response straight away.
  useEffect(() => {
    if (/[#&?](code|error)=/.test(window.location.hash + window.location.search)) activate();
  }, [activate]);

  const signIn = useCallback(
    async (options: { devName?: string; returnTo?: string } = {}) => {
      const ready = await backend();
      const user = await ready.signIn(options);
      if (user) setState({ status: 'signedIn', mode: ready.mode, user, error: null });
    },
    [backend],
  );

  const signOut = useCallback(async () => {
    const ready = await backend();
    await ready.signOut();
    setState({ status: 'signedOut', mode: ready.mode, user: null, error: null });
  }, [backend]);

  const getToken = useCallback(async () => (await backend()).getToken(), [backend]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, activate, signIn, signOut, getToken }),
    [state, activate, signIn, signOut, getToken],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
