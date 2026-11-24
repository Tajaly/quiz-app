import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeSelect } from './ThemeSelect';

let media: EventTarget & { matches: boolean };

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  );
});

afterEach(() => {
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ThemeSelect', () => {
  it('defaults to the system appearance and saves explicit choices', async () => {
    const user = userEvent.setup();
    render(<ThemeSelect />);
    const select = screen.getByRole('combobox', { name: 'Colour theme' });
    expect(select).toHaveValue('system');
    for (const theme of ['dark', 'light', 'system']) {
      await user.selectOptions(select, theme);
      expect(select).toHaveValue(theme);
      expect(document.documentElement.dataset.theme).toBe(theme);
      expect(localStorage.getItem('pq:theme')).toBe(theme);
    }
  });

  it('uses the preference applied by the pre-paint bootstrap', () => {
    document.documentElement.dataset.theme = 'dark';
    render(<ThemeSelect />);
    expect(screen.getByRole('combobox')).toHaveValue('dark');
  });

  it('synchronizes controls and storage changes from other tabs', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ThemeSelect />
        <ThemeSelect />
      </>,
    );
    const [first, second] = screen.getAllByRole('combobox');
    await user.selectOptions(first!, 'dark');
    expect(second).toHaveValue('dark');

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'pq:theme',
          newValue: 'light',
          storageArea: localStorage,
        }),
      );
    });
    expect(first).toHaveValue('light');
    expect(second).toHaveValue('light');

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: null,
          newValue: null,
          storageArea: localStorage,
        }),
      );
    });
    expect(first).toHaveValue('system');
  });

  it('ignores unrelated storage and treats invalid themes as system', () => {
    document.documentElement.dataset.theme = 'dark';
    render(<ThemeSelect />);
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'unrelated',
          newValue: 'light',
          storageArea: localStorage,
        }),
      );
    });
    expect(screen.getByRole('combobox')).toHaveValue('dark');
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'pq:theme',
          newValue: 'invalid',
          storageArea: localStorage,
        }),
      );
    });
    expect(screen.getByRole('combobox')).toHaveValue('system');
  });

  it('keeps the control usable and reports a persistence failure', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<ThemeSelect />);
    await user.selectOptions(screen.getByRole('combobox'), 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('status')).toHaveTextContent('could not be saved');
    expect(warning).toHaveBeenCalledOnce();
  });

  it('updates browser chrome for system changes without overriding a saved choice', async () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
    const user = userEvent.setup();
    const { unmount } = render(<ThemeSelect />);
    expect(meta.content).toBe('#edf8ff');
    act(() => {
      media.matches = true;
      media.dispatchEvent(new Event('change'));
    });
    expect(meta.content).toBe('#101d2b');
    await user.selectOptions(screen.getByRole('combobox'), 'light');
    act(() => media.dispatchEvent(new Event('change')));
    expect(meta.content).toBe('#edf8ff');
    unmount();
    meta.remove();
  });
});
