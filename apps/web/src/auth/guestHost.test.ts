import { afterEach, describe, expect, it, vi } from 'vitest';
import { guestHostTokenSchema } from '@power-quiz/shared';
import { GUEST_HOST_STORAGE_KEY, getOrCreateGuestHostToken, readGuestHostToken } from './guestHost';

afterEach(() => vi.restoreAllMocks());

describe('guest host keys', () => {
  it('does not create a host key just by reading storage', () => {
    expect(readGuestHostToken()).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('generates and saves 32 cryptographically random bytes', async () => {
    const random = vi.spyOn(crypto, 'getRandomValues');
    const token = await getOrCreateGuestHostToken();
    expect(random).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ byteLength: 32 }));
    expect(guestHostTokenSchema.safeParse(token).success).toBe(true);
    expect(readGuestHostToken()).toBe(token);
  });

  it('reuses the key across repeated and concurrent initialization', async () => {
    const tokens = await Promise.all(Array.from({ length: 10 }, () => getOrCreateGuestHostToken()));
    expect(new Set(tokens).size).toBe(1);
    expect(await getOrCreateGuestHostToken()).toBe(tokens[0]);
  });

  it('does not replace an invalid saved key and silently orphan earlier quizzes', async () => {
    localStorage.setItem(GUEST_HOST_STORAGE_KEY, 'damaged-key');
    await expect(getOrCreateGuestHostToken()).rejects.toThrow(/saved host key is invalid/);
    expect(localStorage.getItem(GUEST_HOST_STORAGE_KEY)).toBe('damaged-key');
  });

  it('explains when browser storage cannot be read', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    await expect(getOrCreateGuestHostToken()).rejects.toThrow(/Allow site storage/);
  });

  it('does not fall back to a temporary key when persistence fails', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    await expect(getOrCreateGuestHostToken()).rejects.toThrow(/host key could not be saved/);
    expect(readGuestHostToken()).toBeNull();
  });

  it('never falls back to weak randomness', async () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(() => {
      throw new Error('Unavailable');
    });
    await expect(getOrCreateGuestHostToken()).rejects.toThrow(/cannot create a secure host key/);
    expect(readGuestHostToken()).toBeNull();
  });
});
