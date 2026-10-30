import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const windows = process.platform === 'win32';
// Windows PowerShell can take several seconds to start on a busy machine.
const HOOK_TIMEOUT_MS = 60_000;

function runHook(
  hook: 'preprovision' | 'postprovision',
  mode?: string,
  clientId = '',
): Promise<{ status: number | null; output: string }> {
  const script = fileURLToPath(
    new URL(`../../../infra/hooks/${hook}.${windows ? 'ps1' : 'sh'}`, import.meta.url),
  );
  return new Promise((resolve, reject) => {
    const child = spawn(
      windows ? 'powershell.exe' : 'sh',
      windows ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script] : [script],
      {
        timeout: HOOK_TIMEOUT_MS - 5_000,
        windowsHide: true,
        env: {
          ...process.env,
          AUTH_MODE: mode,
          ENTRA_CLIENT_ID: clientId,
          ENTRA_TENANT_ID: '',
          WEB_URI: 'https://quiz.example.test',
          CI: 'true',
          GITHUB_ACTIONS: 'true',
        },
      },
    );
    let output = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (output += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (output += chunk));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, output }));
  });
}

describe.each(['preprovision', 'postprovision'] as const)('%s host access configuration', (hook) => {
  it.each([undefined, 'guest'])(
    'skips Entra setup for guest hosting (%s)',
    async (mode) => {
      const result = await runHook(hook, mode);
      expect(result.status).toBe(0);
      expect(result.output).toContain('Using guest hosting');
      expect(result.output).not.toContain('not set');
    },
    HOOK_TIMEOUT_MS,
  );

  it(
    'ignores old Entra IDs when guest hosting is selected',
    async () => {
      const result = await runHook(hook, 'guest', 'previous-registration');
      expect(result.status).toBe(0);
      expect(result.output).toContain('Using guest hosting');
      expect(result.output).not.toContain('previous-registration');
    },
    HOOK_TIMEOUT_MS,
  );

  it(
    'preserves explicit Entra configuration without changing registrations in CI',
    async () => {
      const result = await runHook(hook, 'entra', 'existing-registration');
      expect(result.status).toBe(0);
      expect(result.output).toContain(hook === 'preprovision' ? 'reusing' : 'not changed');
    },
    HOOK_TIMEOUT_MS,
  );

  it.each(['dev', 'ENTRA', 'unknown'])(
    'refuses unsupported deployment modes (%s)',
    async (mode) => {
      const result = await runHook(hook, mode);
      expect(result.status).toBe(1);
      expect(result.output).toContain('AUTH_MODE must be guest or entra');
    },
    HOOK_TIMEOUT_MS,
  );
});

it(
  'still refuses missing Entra registration settings in CI when Entra is explicitly selected',
  async () => {
    const result = await runHook('preprovision', 'entra');
    expect(result.status).toBe(1);
    expect(result.output).toContain('ENTRA_CLIENT_ID is not set');
  },
  HOOK_TIMEOUT_MS,
);
