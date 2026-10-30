import { z } from 'zod';

const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  AUTH_MODE: z.enum(['entra', 'dev']).optional(),
  ENTRA_TENANT_ID: z.string().trim().optional(),
  ENTRA_CLIENT_ID: z.string().trim().optional(),
  ENTRA_API_SCOPE_NAME: z.string().trim().default('Quiz.Host'),
  COSMOS_ENDPOINT: z.url().optional(),
  COSMOS_KEY: z.string().optional(),
  COSMOS_DATABASE: z.string().trim().default('powerquiz'),
  COSMOS_CREATE_IF_NOT_EXISTS: booleanish.default(false),
  RESULT_TTL_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
  STATIC_DIR: z.string().optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
});

export type AuthConfig =
  { mode: 'dev' } | { mode: 'entra'; tenantId: string; clientId: string; scopeName: string };

export interface CosmosConfig {
  endpoint: string;
  key?: string;
  database: string;
  createIfNotExists: boolean;
}

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  logLevel: string;
  auth: AuthConfig;
  cosmos: CosmosConfig | null;
  resultTtlSeconds: number;
  staticDir: string | null;
  /** Number of reverse-proxy hops to trust for client IPs (1 on Azure App Service). */
  trustProxy: number;
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  // Treat empty variables (e.g. `ENTRA_CLIENT_ID=`) as unset.
  const env = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  );
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid configuration: ${details}`);
  }
  const values = parsed.data;

  const mode = values.AUTH_MODE ?? (values.ENTRA_TENANT_ID && values.ENTRA_CLIENT_ID ? 'entra' : 'dev');
  let auth: AuthConfig;
  if (mode === 'entra') {
    if (!values.ENTRA_TENANT_ID || !values.ENTRA_CLIENT_ID) {
      throw new Error('AUTH_MODE=entra requires ENTRA_TENANT_ID and ENTRA_CLIENT_ID');
    }
    auth = {
      mode: 'entra',
      tenantId: values.ENTRA_TENANT_ID,
      clientId: values.ENTRA_CLIENT_ID,
      scopeName: values.ENTRA_API_SCOPE_NAME,
    };
  } else {
    if (values.NODE_ENV === 'production') {
      throw new Error(
        'Dev sign-in is not allowed in production. Configure ENTRA_TENANT_ID and ENTRA_CLIENT_ID.',
      );
    }
    auth = { mode: 'dev' };
  }

  return {
    env: values.NODE_ENV,
    port: values.PORT,
    logLevel: values.LOG_LEVEL,
    auth,
    cosmos: values.COSMOS_ENDPOINT
      ? {
          endpoint: values.COSMOS_ENDPOINT,
          key: values.COSMOS_KEY,
          database: values.COSMOS_DATABASE,
          createIfNotExists: values.COSMOS_CREATE_IF_NOT_EXISTS,
        }
      : null,
    resultTtlSeconds: values.RESULT_TTL_DAYS * 24 * 60 * 60,
    staticDir: values.STATIC_DIR ?? null,
    trustProxy: values.TRUST_PROXY,
  };
}
