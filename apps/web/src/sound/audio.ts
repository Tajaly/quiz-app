/**
 * Retro chiptune sound engine for the lead's shared screen. Everything is synthesized with the Web Audio
 * API; without Web Audio (old browsers, jsdom) every method quietly becomes a no-op.
 *
 * Graph: voices → music bus / sfx bus → master (mute) → destination.
 */
import { SONGS } from './music';
import { Sequencer } from './sequencer';
import { SFX } from './sfx';
import { Synth } from './synth';

export type SfxName =
  | 'join'
  | 'countdownTick'
  | 'go'
  | 'answer'
  | 'timeUp'
  | 'reveal'
  | 'correct'
  | 'whoosh'
  | 'overtake'
  | 'fanfare'
  | 'click';

export type MusicTrack = 'none' | 'lobby' | 'race' | 'results';

export interface SoundEngine {
  /** Must be called from a user gesture (click/keydown). Creates or resumes the AudioContext. Safe to call repeatedly. */
  unlock(): Promise<void>;
  isUnlocked(): boolean;
  isMuted(): boolean;
  /** Persists to localStorage key 'pq:muted' ('1' | '0'); default unmuted. */
  setMuted(muted: boolean): void;
  toggleMuted(): void;
  /** Fire-and-forget; no-op if locked, muted or unsupported. */
  play(name: SfxName): void;
  /** Idempotent; remembers the requested track even before unlock and starts it once unlocked. */
  setMusic(track: MusicTrack): void;
  /** Notified when the muted/unlocked state changes (for useSyncExternalStore). */
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export interface SoundEngineOptions {
  storage?: Storage;
  audioContextFactory?: () => AudioContext | null;
}

const MUTED_KEY = 'pq:muted';
const MASTER_VOLUME = 0.5;
const MUSIC_VOLUME = 0.35;
const SFX_VOLUME = 0.8;
/** Time constant of the master gain ramp when (un)muting; short enough to feel instant, long enough not to click. */
const MUTE_RAMP = 0.015;
const MUSIC_FADE = 0.3;
const MUSIC_START_DELAY = 0.05;
/** Small scheduling margin so the attack of a sound effect is never cut off. */
const SFX_DELAY = 0.005;
/** Identical effects fired in the same instant only stack up and clip, so play them at most this often. */
const SFX_MIN_GAP = 0.03;
const ANSWER_MIN_GAP = 0.06;

interface AudioGraph {
  ctx: AudioContext;
  synth: Synth;
  master: GainNode;
  musicBus: GainNode;
  sfxBus: GainNode;
}

type AudioGlobals = typeof globalThis & { webkitAudioContext?: typeof AudioContext };

function defaultAudioContextFactory(): AudioContext | null {
  const scope = globalThis as AudioGlobals;
  const AudioContextClass = scope.AudioContext ?? scope.webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    return new AudioContextClass();
  } catch {
    return null;
  }
}

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    // Access to storage can throw (e.g. blocked third-party storage).
    return undefined;
  }
}

function readMuted(storage: Storage | undefined): boolean {
  try {
    return storage?.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

function tryCreateContext(factory: () => AudioContext | null): AudioContext | null {
  try {
    return factory();
  } catch {
    return null;
  }
}

function closeQuietly(ctx: AudioContext): void {
  try {
    void ctx.close().catch(() => undefined);
  } catch {
    // Already closed or not supported.
  }
}

function buildEngine(options: SoundEngineOptions, onDispose?: () => void): SoundEngine {
  const storage = options.storage ?? defaultStorage();
  const createContext = options.audioContextFactory ?? defaultAudioContextFactory;
  const listeners = new Set<() => void>();
  const lastPlayed = new Map<SfxName, number>();
  const playCounts = new Map<SfxName, number>();

  let muted = readMuted(storage);
  let unlocked = false;
  let disposed = false;
  let unsupported = false;
  let graph: AudioGraph | null = null;
  let requestedTrack: MusicTrack = 'none';
  let music: { track: MusicTrack; sequencer: Sequencer } | null = null;

  function notify(): void {
    for (const listener of [...listeners]) listener();
  }

  function setUnlocked(next: boolean): void {
    if (disposed || next === unlocked) return;
    unlocked = next;
    if (next) syncMusic();
    notify();
  }

  function ensureGraph(): AudioGraph | null {
    if (graph || unsupported) return graph;
    const ctx = tryCreateContext(createContext);
    if (!ctx) {
      unsupported = true;
      return null;
    }
    try {
      const master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_VOLUME;
      master.connect(ctx.destination);
      const musicBus = ctx.createGain();
      musicBus.gain.value = MUSIC_VOLUME;
      musicBus.connect(master);
      const sfxBus = ctx.createGain();
      sfxBus.gain.value = SFX_VOLUME;
      sfxBus.connect(master);
      const created: AudioGraph = { ctx, synth: new Synth(ctx), master, musicBus, sfxBus };
      // Browsers may suspend or interrupt the context later (e.g. iOS calls); reflect that in `unlocked`.
      ctx.onstatechange = () => {
        if (graph === created) setUnlocked(created.ctx.state === 'running');
      };
      graph = created;
    } catch {
      unsupported = true;
      closeQuietly(ctx);
    }
    return graph;
  }

  async function unlock(): Promise<void> {
    if (disposed) return;
    const current = ensureGraph();
    if (!current) return;
    if (current.ctx.state !== 'running') {
      try {
        await current.ctx.resume();
      } catch {
        // Blocked by the autoplay policy (not a user gesture); stay locked until the next attempt.
      }
    }
    if (graph === current) setUnlocked(current.ctx.state === 'running');
  }

  function applyMasterVolume(): void {
    if (!graph) return;
    try {
      const { gain } = graph.master;
      const now = graph.ctx.currentTime;
      gain.cancelScheduledValues(now);
      gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, now, MUTE_RAMP);
    } catch {
      // Context closed.
    }
  }

  function setMuted(next: boolean): void {
    if (disposed || next === muted) return;
    muted = next;
    try {
      storage?.setItem(MUTED_KEY, next ? '1' : '0');
    } catch {
      // Storage full or blocked; the choice still applies for this session.
    }
    applyMasterVolume();
    notify();
  }

  function play(name: SfxName): void {
    if (disposed || muted || !unlocked || !graph) return;
    const { ctx, synth, sfxBus } = graph;
    try {
      if (ctx.state !== 'running') return;
      const now = ctx.currentTime;
      const minGap = name === 'answer' ? ANSWER_MIN_GAP : SFX_MIN_GAP;
      if (now - (lastPlayed.get(name) ?? -Infinity) < minGap) return;
      lastPlayed.set(name, now);
      const variant = playCounts.get(name) ?? 0;
      playCounts.set(name, variant + 1);
      SFX[name](synth, sfxBus, now + SFX_DELAY, variant);
    } catch {
      // A sound effect must never break the UI.
    }
  }

  /** Makes the playing sequencer match the requested track (fading out the old one). */
  function syncMusic(): void {
    if (!graph || !unlocked) return;
    const track = requestedTrack;
    if ((music?.track ?? 'none') === track) return;
    const { ctx, synth, musicBus } = graph;
    try {
      let startAt = ctx.currentTime + MUSIC_START_DELAY;
      if (music) {
        music.sequencer.stop(MUSIC_FADE);
        music = null;
        startAt = ctx.currentTime + MUSIC_FADE;
      }
      if (track === 'none') return;
      // While muted the sequencer keeps time but skips creating voices, so unmuting resumes in sync.
      const sequencer = new Sequencer(synth, musicBus, SONGS[track], startAt, () => muted);
      music = { track, sequencer };
      sequencer.start();
    } catch {
      music = null;
    }
  }

  function setMusic(track: MusicTrack): void {
    if (disposed || track === requestedTrack) return;
    requestedTrack = track;
    syncMusic();
  }

  function subscribe(listener: () => void): () => void {
    if (disposed) return () => undefined;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    music?.sequencer.stop(0);
    music = null;
    listeners.clear();
    if (graph) {
      const { ctx } = graph;
      graph = null;
      ctx.onstatechange = null;
      closeQuietly(ctx);
    }
    unlocked = false;
    onDispose?.();
  }

  return {
    unlock,
    isUnlocked: () => unlocked,
    isMuted: () => muted,
    setMuted,
    toggleMuted: () => setMuted(!muted),
    play,
    setMusic,
    subscribe,
    dispose,
  };
}

export function createSoundEngine(options: SoundEngineOptions = {}): SoundEngine {
  return buildEngine(options);
}

let sharedEngine: SoundEngine | null = null;

/** Lazily-created app-wide engine. Disposing it lets the next call create a fresh one. */
export function getSoundEngine(): SoundEngine {
  if (!sharedEngine) {
    const engine = buildEngine({}, () => {
      if (sharedEngine === engine) sharedEngine = null;
    });
    sharedEngine = engine;
  }
  return sharedEngine;
}

// During development, stop the old engine's music when this module is hot-replaced.
if (import.meta.hot) {
  import.meta.hot.dispose(() => sharedEngine?.dispose());
}
