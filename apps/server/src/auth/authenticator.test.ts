import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import {
  AuthError,
  bearerToken,
  createDevAuthenticator,
  createEntraAuthenticator,
  createGuestAuthenticator,
} from './authenticator';

const tenantId = '11111111-1111-1111-1111-111111111111';
const clientId = '22222222-2222-2222-2222-222222222222';
const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let jwks: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  jwks = createLocalJWKSet({ keys: [{ ...jwk, kid: 'test-key', alg: 'RS256', use: 'sig' }] });
});

interface TokenOptions {
  claims?: Record<string, unknown>;
  audience?: string;
  issuer?: string;
  expiresIn?: string;
}

function token(options: TokenOptions = {}) {
  return new SignJWT({
    tid: tenantId,
    scp: 'Quiz.Host',
    oid: 'user-oid',
    name: 'Ada Lovelace',
    preferred_username: 'ada@contoso.com',
    ...options.claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(options.issuer ?? issuer)
    .setAudience(options.audience ?? clientId)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '1h')
    .sign(privateKey);
}

describe('Entra authenticator', () => {
  const auth = () => createEntraAuthenticator({ tenantId, clientId, scopeName: 'Quiz.Host', jwks });

  it('accepts a valid access token and maps the user', async () => {
    await expect(auth().verify(await token())).resolves.toEqual({
      id: 'user-oid',
      name: 'Ada Lovelace',
      username: 'ada@contoso.com',
    });
  });

  it('accepts the api:// audience form', async () => {
    await expect(auth().verify(await token({ audience: `api://${clientId}` }))).resolves.toMatchObject({
      id: 'user-oid',
    });
  });

  it.each([
    ['another tenant', { claims: { tid: '33333333-3333-3333-3333-333333333333' } }],
    ['a missing scope', { claims: { scp: 'User.Read' } }],
    ['another audience', { audience: 'someone-else' }],
    ['another issuer', { issuer: 'https://login.microsoftonline.com/common/v2.0' }],
    ['an expired token', { expiresIn: '-2h' }],
    ['a missing object id', { claims: { oid: undefined } }],
  ])('rejects %s', async (_label, options) => {
    await expect(auth().verify(await token(options as TokenOptions))).rejects.toBeInstanceOf(AuthError);
  });

  it('rejects garbage', async () => {
    await expect(auth().verify('not-a-jwt')).rejects.toBeInstanceOf(AuthError);
  });
});

describe('Guest authenticator', () => {
  const guestToken = () => `guest:${randomBytes(32).toString('hex')}`;

  it('derives a stable owner across server restarts without storing the secret', async () => {
    const key = guestToken();
    const user = await createGuestAuthenticator().verify(key);
    expect(user).toMatchObject({ name: 'Guest host', id: expect.stringMatching(/^guest-[\w-]{43}$/) });
    expect(user.id).not.toContain(key.slice('guest:'.length));
    expect(await createGuestAuthenticator().verify(key)).toEqual(user);
  });

  it('keeps different browser keys isolated', async () => {
    const auth = createGuestAuthenticator();
    expect((await auth.verify(guestToken())).id).not.toBe((await auth.verify(guestToken())).id);
  });

  it.each([
    '',
    'dev:Alice',
    '123456',
    'guest:123456',
    `guest:${'a'.repeat(63)}`,
    `guest:${'g'.repeat(64)}`,
    `guest:${'a'.repeat(64)}\n`,
  ])('rejects malformed keys: %s', async (key) => {
    await expect(createGuestAuthenticator().verify(key)).rejects.toBeInstanceOf(AuthError);
  });

  it('does not accept a public owner ID as its credential', async () => {
    const auth = createGuestAuthenticator();
    const user = await auth.verify(guestToken());
    await expect(auth.verify(user.id)).rejects.toBeInstanceOf(AuthError);
  });
});

describe('Dev authenticator', () => {
  it('derives a stable user from the display name', async () => {
    await expect(createDevAuthenticator().verify('dev:Ada%20Lovelace')).resolves.toEqual({
      id: 'dev-ada-lovelace',
      name: 'Ada Lovelace',
    });
  });

  it('rejects other tokens', async () => {
    await expect(createDevAuthenticator().verify('eyJhbGciOi')).rejects.toBeInstanceOf(AuthError);
    await expect(createDevAuthenticator().verify('dev:')).rejects.toBeInstanceOf(AuthError);
    await expect(createDevAuthenticator().verify('dev:%E0%A4%A')).rejects.toBeInstanceOf(AuthError);
  });
});

describe('bearerToken', () => {
  it('extracts bearer tokens', () => {
    expect(bearerToken('Bearer abc.def')).toBe('abc.def');
    expect(bearerToken('bearer abc')).toBe('abc');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });
});
