import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getSoundEngine } from './audio';
import { useSound } from './useSound';

afterEach(() => {
  getSoundEngine().dispose();
});

describe('useSound', () => {
  it('reflects the shared engine state and keeps stable actions', () => {
    const { result } = renderHook(() => useSound());
    const initial = result.current;
    expect(initial.muted).toBe(false);
    expect(initial.unlocked).toBe(false);

    act(() => initial.toggleMuted());

    expect(result.current.muted).toBe(true);
    expect(getSoundEngine().isMuted()).toBe(true);
    expect(localStorage.getItem('pq:muted')).toBe('1');
    expect(result.current.toggleMuted).toBe(initial.toggleMuted);
    expect(result.current.unlock).toBe(initial.unlock);
    expect(result.current.play).toBe(initial.play);
    expect(result.current.setMusic).toBe(initial.setMusic);
  });

  it('is safe to use without Web Audio', async () => {
    const { result } = renderHook(() => useSound());
    await act(() => result.current.unlock());
    expect(result.current.unlocked).toBe(false);
    expect(() => {
      result.current.setMusic('lobby');
      result.current.play('go');
    }).not.toThrow();
  });
});
