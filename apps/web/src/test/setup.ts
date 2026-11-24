import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom does not implement media queries; tests can override matches and dispatch changes.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) =>
    Object.assign(new EventTarget(), {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
    }),
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});
