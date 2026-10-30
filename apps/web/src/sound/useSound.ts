import { useMemo, useSyncExternalStore } from 'react';
import { getSoundEngine, type MusicTrack, type SfxName } from './audio';

export interface SoundControls {
  muted: boolean;
  unlocked: boolean;
  toggleMuted(): void;
  unlock(): Promise<void>;
  play(name: SfxName): void;
  setMusic(track: MusicTrack): void;
}

/** React binding for the shared sound engine. The returned functions keep a stable identity. */
export function useSound(): SoundControls {
  const engine = getSoundEngine();
  const muted = useSyncExternalStore(engine.subscribe, engine.isMuted);
  const unlocked = useSyncExternalStore(engine.subscribe, engine.isUnlocked);
  return useMemo(
    () => ({
      muted,
      unlocked,
      toggleMuted: engine.toggleMuted,
      unlock: engine.unlock,
      play: engine.play,
      setMusic: engine.setMusic,
    }),
    [engine, muted, unlocked],
  );
}
