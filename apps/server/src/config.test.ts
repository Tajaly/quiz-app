import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('defaults to dev sign-in and in-memory storage', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      env: 'development',
      port: 3000,
      auth: { mode: 'dev' },
      cosmos: null,
      resultTtlSeconds: 90 * 86_400,
      trustProxy: 0,
    });
  });

  it('switches to Entra when tenant and client are configured', () => {
    const config = loadConfig({ ENTRA_TENANT_ID: 'tenant', ENTRA_CLIENT_ID: 'client' });
    expect(config.auth).toEqual({
      mode: 'entra',
      tenantId: 'tenant',
      clientId: 'client',
      scopeName: 'Quiz.Host',
    });
  });

  it('ignores empty variables', () => {
    expect(loadConfig({ ENTRA_TENANT_ID: '', ENTRA_CLIENT_ID: '', COSMOS_ENDPOINT: '' }).auth.mode).toBe(
      'dev',
    );
  });

  it('refuses dev sign-in in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/not allowed in production/);
    expect(() => loadConfig({ NODE_ENV: 'production', AUTH_MODE: 'dev' })).toThrow(
      /not allowed in production/,
    );
  });

  it('requires Entra settings when AUTH_MODE=entra', () => {
    expect(() => loadConfig({ AUTH_MODE: 'entra' })).toThrow(/ENTRA_TENANT_ID/);
  });

  it('reads Cosmos DB and proxy settings', () => {
    const config = loadConfig({
      COSMOS_ENDPOINT: 'https://example.documents.azure.com:443/',
      COSMOS_CREATE_IF_NOT_EXISTS: 'true',
      RESULT_TTL_DAYS: '7',
      TRUST_PROXY: '1',
    });
    expect(config.cosmos).toEqual({
      endpoint: 'https://example.documents.azure.com:443/',
      key: undefined,
      database: 'powerquiz',
      createIfNotExists: true,
    });
    expect(config.resultTtlSeconds).toBe(7 * 86_400);
    expect(config.trustProxy).toBe(1);
  });

  it('reports invalid values', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/Invalid configuration: PORT/);
  });
});
