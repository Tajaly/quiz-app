import { useState, useSyncExternalStore } from 'react';

type Theme = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'pq:theme';
const CHANGE_EVENT = 'pq:theme-change';

function parseTheme(value: string | null | undefined): Theme {
  return value === 'light' || value === 'dark' ? value : 'system';
}

function getTheme(): Theme {
  return parseTheme(document.documentElement.dataset.theme);
}

function updateBrowserColor() {
  const theme = getTheme();
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#101d2b' : '#edf8ff');
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea !== localStorage || (event.key !== STORAGE_KEY && event.key !== null)) return;
    document.documentElement.dataset.theme = parseTheme(event.newValue);
    updateBrowserColor();
    onChange();
  };
  const media = matchMedia('(prefers-color-scheme: dark)');
  updateBrowserColor();
  media.addEventListener('change', updateBrowserColor);
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    media.removeEventListener('change', updateBrowserColor);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function ThemeSelect() {
  const theme = useSyncExternalStore(subscribe, getTheme);
  const [storageError, setStorageError] = useState(false);

  return (
    <div className="flex shrink-0 flex-col gap-1">
      <label>
        <span className="sr-only">Colour theme</span>
        <select
          className="min-h-11 max-w-full rounded-lg border border-field-border bg-panel px-2 text-sm font-semibold text-ink"
          value={theme}
          onChange={(event) => {
            const next = parseTheme(event.target.value);
            document.documentElement.dataset.theme = next;
            updateBrowserColor();
            window.dispatchEvent(new Event(CHANGE_EVENT));
            try {
              localStorage.setItem(STORAGE_KEY, next);
              setStorageError(false);
            } catch (error) {
              console.warn('Theme preference could not be saved.', error);
              setStorageError(true);
            }
          }}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      {storageError && (
        <p role="status" className="max-w-40 text-xs text-flame">
          Theme changed, but could not be saved in this browser.
        </p>
      )}
    </div>
  );
}
