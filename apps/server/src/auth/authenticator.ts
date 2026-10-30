import type { RequestHandler, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import type { UserInfo } from '@power-quiz/shared';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user?: UserInfo;
    }
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface Authenticator {
  readonly mode: 'entra' | 'dev';
  verify(token: string): Promise<UserInfo>;
}

export interface EntraAuthOptions {
  tenantId: string;
  clientId: string;
  scopeName: string;
  /** Override the key source (tests). Defaults to the tenant's published signing keys. */
  jwks?: JWTVerifyGetKey;
}

const stringClaim = (payload: JWTPayload, name: string): string | undefined => {
  const value = payload[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

/** Validates Entra ID v2 access tokens issued for this app's API scope in a single tenant. */
export function createEntraAuthenticator(options: EntraAuthOptions): Authenticator {
  const jwks =
    options.jwks ??
    createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${options.tenantId}/discovery/v2.0/keys`));
  const issuer = `https://login.microsoftonline.com/${options.tenantId}/v2.0`;
  const audience = [options.clientId, `api://${options.clientId}`];

  return {
    mode: 'entra',
    async verify(token) {
      let payload: JWTPayload;
      try {
        ({ payload } = await jwtVerify(token, jwks, {
          issuer,
          audience,
          algorithms: ['RS256'],
          clockTolerance: 60,
        }));
      } catch {
        throw new AuthError('Invalid or expired access token');
      }
      if (payload.tid !== options.tenantId) throw new AuthError('Token was issued for another tenant');
      const scopes = stringClaim(payload, 'scp')?.split(' ') ?? [];
      if (!scopes.includes(options.scopeName)) throw new AuthError('Token is missing the required scope');
      const oid = stringClaim(payload, 'oid');
      if (!oid) throw new AuthError('Token has no object id');
      const username = stringClaim(payload, 'preferred_username');
      return { id: oid, name: stringClaim(payload, 'name') ?? username ?? 'Quiz host', username };
    },
  };
}

export const DEV_TOKEN_PREFIX = 'dev:';

/** Local development only: accepts `dev:<display name>` tokens without any real authentication. */
export function createDevAuthenticator(): Authenticator {
  return {
    mode: 'dev',
    async verify(token) {
      if (!token.startsWith(DEV_TOKEN_PREFIX)) throw new AuthError('Invalid dev token');
      let name: string;
      try {
        name = decodeURIComponent(token.slice(DEV_TOKEN_PREFIX.length)).trim();
      } catch {
        throw new AuthError('Invalid dev token');
      }
      if (!name || name.length > 40) throw new AuthError('Invalid dev token');
      const slug =
        name
          .normalize('NFKD')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'host';
      return { id: `dev-${slug}`, name };
    },
  };
}

export function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return match?.[1] ?? null;
}

export function requireAuth(auth: Authenticator): RequestHandler {
  return async (req, res, next) => {
    const token = bearerToken(req.headers.authorization);
    if (!token) {
      res.status(401).json({ error: 'Please sign in.' });
      return;
    }
    try {
      res.locals.user = await auth.verify(token);
    } catch {
      res.status(401).json({ error: 'Your sign-in has expired. Please sign in again.' });
      return;
    }
    next();
  };
}

export function currentUser(res: Response): UserInfo {
  const user = res.locals.user;
  if (!user) throw new Error('requireAuth middleware is missing');
  return user;
}
