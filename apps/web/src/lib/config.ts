import type { ClientConfig } from '@power-quiz/shared';

let configPromise: Promise<ClientConfig> | null = null;

/** Fetched at runtime so one build works in every environment. */
export function loadClientConfig(): Promise<ClientConfig> {
  configPromise ??= fetch('/api/config')
    .then(async (response) => {
      if (!response.ok) throw new Error(`Could not load app configuration (${response.status})`);
      return (await response.json()) as ClientConfig;
    })
    .catch((error: unknown) => {
      configPromise = null;
      throw error;
    });
  return configPromise;
}
