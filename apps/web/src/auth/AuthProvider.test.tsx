import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireHost } from '../features/host/RequireHost';
import { loadClientConfig } from '../lib/config';
import { AuthProvider, useAuth } from './AuthProvider';
import { GUEST_HOST_STORAGE_KEY, readGuestHostToken } from './guestHost';

vi.mock('../lib/config', () => ({ loadClientConfig: vi.fn() }));

beforeEach(() => {
  vi.mocked(loadClientConfig).mockReset().mockResolvedValue({ authMode: 'guest', entra: null });
});

afterEach(() => vi.restoreAllMocks());

function renderHost() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <RequireHost>
          <h1>Your quizzes</h1>
        </RequireHost>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('host access', () => {
  it('does not create host credentials or load sign-in support for player pages', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    expect(result.current.status).toBe('idle');
    expect(loadClientConfig).not.toHaveBeenCalled();
    expect(readGuestHostToken()).toBeNull();
  });

  it('opens guest host pages without a name, registration or sign-in screen', async () => {
    renderHost();
    expect(await screen.findByRole('heading', { name: 'Your quizzes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
    expect(readGuestHostToken()).toMatch(/^guest:[a-f0-9]{64}$/);
  });

  it('keeps the same private key when host access is initialized again', async () => {
    const first = renderHook(() => useAuth(), { wrapper: AuthProvider });
    act(() => first.result.current.activate());
    await waitFor(() => expect(first.result.current.status).toBe('signedIn'));
    const token = await first.result.current.getToken();
    first.unmount();

    const again = renderHook(() => useAuth(), { wrapper: AuthProvider });
    act(() => again.result.current.activate());
    await waitFor(() => expect(again.result.current.status).toBe('signedIn'));
    expect(await again.result.current.getToken()).toBe(token);
    expect(again.result.current.user).toEqual({ name: 'Guest host' });
  });

  it('does not silently create a new owner when the key is removed in another tab', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    act(() => result.current.activate());
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    localStorage.removeItem(GUEST_HOST_STORAGE_KEY);
    await expect(result.current.getToken()).rejects.toThrow(/host key was removed from this browser/);
    expect(readGuestHostToken()).toBeNull();
  });

  it('uses the key the browser kept after another tab won a first-use race', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    act(() => result.current.activate());
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    const kept = `guest:${'b'.repeat(64)}`;
    localStorage.setItem(GUEST_HOST_STORAGE_KEY, kept);
    await expect(result.current.getToken()).resolves.toBe(kept);
  });

  it('shows a storage error and lets the host retry after fixing it', async () => {
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    renderHost();
    expect(await screen.findByRole('alert')).toHaveTextContent('Allow site storage and try again.');
    expect(screen.queryByRole('heading', { name: 'Your quizzes' })).not.toBeInTheDocument();
    write.mockRestore();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Your quizzes' })).toBeInTheDocument();
  });

  it('preserves explicitly selected development sign-in', async () => {
    vi.mocked(loadClientConfig).mockResolvedValue({ authMode: 'dev', entra: null });
    renderHost();
    await userEvent.type(await screen.findByLabelText('Your name'), 'Ada');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in (dev)' }));
    expect(await screen.findByRole('heading', { name: 'Your quizzes' })).toBeInTheDocument();
    expect(readGuestHostToken()).toBeNull();
  });

  it('does not fall back to guest or dev access for an incomplete Entra configuration', async () => {
    vi.mocked(loadClientConfig).mockResolvedValue({ authMode: 'entra', entra: null });
    renderHost();
    expect(await screen.findByRole('alert')).toHaveTextContent('Microsoft sign-in is not configured');
    expect(readGuestHostToken()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign in (dev)' })).not.toBeInTheDocument();
  });
});
