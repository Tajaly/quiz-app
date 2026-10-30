import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSoundEngine, getSoundEngine, type SfxName, type SoundEngine } from './audio';

const ALL_SFX: SfxName[] = [
  'join',
  'countdownTick',
  'go',
  'answer',
  'timeUp',
  'reveal',
  'correct',
  'whoosh',
  'overtake',
  'fanfare',
  'click',
];

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, String(value));
    },
  };
}

// --- A minimal fake of the Web Audio API: only what the engine uses. ---

class FakeParam {
  value: number;
  readonly setValueAtTime = vi.fn();
  readonly linearRampToValueAtTime = vi.fn();
  readonly exponentialRampToValueAtTime = vi.fn();
  readonly setTargetAtTime = vi.fn();
  readonly cancelScheduledValues = vi.fn();

  constructor(value: number) {
    this.value = value;
  }
}

class FakeNode {
  readonly connections: unknown[] = [];
  readonly connect = vi.fn((target: unknown) => {
    this.connections.push(target);
    return target;
  });
  readonly disconnect = vi.fn();
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
}

class FakeFilter extends FakeNode {
  type = 'lowpass';
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
}

class FakeDelay extends FakeNode {
  readonly delayTime = new FakeParam(0);
}

class FakeSource extends FakeNode {
  onended: (() => void) | null = null;
  readonly start = vi.fn();
  readonly stop = vi.fn();
}

class FakeOscillator extends FakeSource {
  type = 'sine';
  readonly frequency = new FakeParam(440);
  readonly detune = new FakeParam(0);
  readonly setPeriodicWave = vi.fn();
}

class FakeBufferSource extends FakeSource {
  buffer: unknown = null;
  loop = false;
}

function remember<T>(list: T[], item: T): T {
  list.push(item);
  return item;
}

class FakeAudioContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  readonly sampleRate = 8000;
  readonly destination = new FakeNode();
  onstatechange: (() => void) | null = null;
  readonly oscillators: FakeOscillator[] = [];
  readonly gains: FakeGain[] = [];
  readonly bufferSources: FakeBufferSource[] = [];

  readonly resume = vi.fn(async () => this.setState('running'));
  readonly close = vi.fn(async () => this.setState('closed'));
  readonly createOscillator = vi.fn(() => remember(this.oscillators, new FakeOscillator()));
  readonly createGain = vi.fn(() => remember(this.gains, new FakeGain()));
  readonly createBufferSource = vi.fn(() => remember(this.bufferSources, new FakeBufferSource()));
  readonly createBiquadFilter = vi.fn(() => new FakeFilter());
  readonly createDelay = vi.fn(() => new FakeDelay());
  readonly createPeriodicWave = vi.fn(() => ({}));
  readonly createBuffer = vi.fn((_channels: number, length: number) => ({
    getChannelData: () => new Float32Array(length),
  }));

  setState(state: AudioContextState): void {
    this.state = state;
    this.onstatechange?.();
  }

  /** Every source node created so far (i.e. every voice). */
  voiceCount(): number {
    return this.oscillators.length + this.bufferSources.length;
  }
}

function defined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}

function reaches(node: unknown, target: FakeNode): boolean {
  const queue = [node];
  const seen = new Set<unknown>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === target) return true;
    if (!(current instanceof FakeNode) || seen.has(current)) continue;
    seen.add(current);
    queue.push(...current.connections);
  }
  return false;
}

const engines: SoundEngine[] = [];

function setup(storage: Storage = memoryStorage()) {
  const ctx = new FakeAudioContext();
  const factory = vi.fn(() => ctx as unknown as AudioContext);
  const engine = createSoundEngine({ storage, audioContextFactory: factory });
  engines.push(engine);
  return { ctx, factory, engine, storage };
}

/** Advances the audio clock and the scheduler timer together, in 25 ms ticks. */
function run(ctx: FakeAudioContext, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.025) {
    ctx.currentTime += 0.025;
    vi.advanceTimersByTime(25);
  }
}

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  vi.useRealTimers();
});

describe('mute state', () => {
  it('defaults to unmuted', () => {
    const { engine } = setup();
    expect(engine.isMuted()).toBe(false);
  });

  it('persists to the provided storage and is read back by a new engine', () => {
    const storage = memoryStorage();
    setup(storage).engine.setMuted(true);
    expect(storage.getItem('pq:muted')).toBe('1');
    expect(setup(storage).engine.isMuted()).toBe(true);

    setup(storage).engine.setMuted(false);
    expect(storage.getItem('pq:muted')).toBe('0');
    expect(setup(storage).engine.isMuted()).toBe(false);
  });

  it('uses localStorage by default', () => {
    const engine = createSoundEngine({ audioContextFactory: () => null });
    engines.push(engine);
    engine.setMuted(true);
    expect(localStorage.getItem('pq:muted')).toBe('1');
  });

  it('toggles', () => {
    const { engine } = setup();
    engine.toggleMuted();
    expect(engine.isMuted()).toBe(true);
    engine.toggleMuted();
    expect(engine.isMuted()).toBe(false);
  });

  it('notifies subscribers on changes until they unsubscribe', () => {
    const { engine } = setup();
    const listener = vi.fn();
    const unsubscribe = engine.subscribe(listener);

    engine.setMuted(true);
    engine.setMuted(true);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    engine.setMuted(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ramps the master gain instead of jumping', async () => {
    const { ctx, engine } = setup();
    await engine.unlock();
    const master = defined(ctx.gains.find((gain) => gain.connections.includes(ctx.destination)));

    engine.setMuted(true);
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, ctx.currentTime, expect.any(Number));
    engine.setMuted(false);
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.5, ctx.currentTime, expect.any(Number));
  });

  it('starts silent when muted before the context exists', async () => {
    const storage = memoryStorage();
    storage.setItem('pq:muted', '1');
    const { ctx, engine } = setup(storage);
    await engine.unlock();
    const master = defined(ctx.gains.find((gain) => gain.connections.includes(ctx.destination)));
    expect(master.gain.value).toBe(0);
  });
});

describe('without Web Audio', () => {
  it('turns every method into a safe no-op', async () => {
    const factory = vi.fn(() => null);
    const engine = createSoundEngine({ storage: memoryStorage(), audioContextFactory: factory });
    engines.push(engine);

    await expect(engine.unlock()).resolves.toBeUndefined();
    await engine.unlock();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(engine.isUnlocked()).toBe(false);
    expect(() => {
      for (const name of ALL_SFX) engine.play(name);
      engine.setMusic('race');
      engine.toggleMuted();
      engine.setMusic('none');
      engine.subscribe(() => undefined)();
      engine.dispose();
      engine.dispose();
      engine.play('go');
      engine.setMusic('lobby');
    }).not.toThrow();
    await expect(engine.unlock()).resolves.toBeUndefined();
  });

  it('survives a throwing factory', async () => {
    const engine = createSoundEngine({
      storage: memoryStorage(),
      audioContextFactory: () => {
        throw new Error('no audio');
      },
    });
    engines.push(engine);
    await expect(engine.unlock()).resolves.toBeUndefined();
    expect(engine.isUnlocked()).toBe(false);
    expect(() => engine.play('click')).not.toThrow();
  });

  it('detects the missing AudioContext global (jsdom)', async () => {
    const engine = createSoundEngine({ storage: memoryStorage() });
    engines.push(engine);
    await engine.unlock();
    expect(engine.isUnlocked()).toBe(false);
  });
});

describe('unlock', () => {
  it('creates the AudioContext once and resumes it', async () => {
    const { ctx, factory, engine } = setup();
    const listener = vi.fn();
    engine.subscribe(listener);
    expect(factory).not.toHaveBeenCalled();

    await engine.unlock();
    await engine.unlock();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(engine.isUnlocked()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stays locked when resume() is rejected and recovers on the next gesture', async () => {
    const { ctx, factory, engine } = setup();
    ctx.resume.mockRejectedValueOnce(new Error('NotAllowedError'));

    await expect(engine.unlock()).resolves.toBeUndefined();
    expect(engine.isUnlocked()).toBe(false);

    await engine.unlock();
    expect(engine.isUnlocked()).toBe(true);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('follows browser-initiated suspensions', async () => {
    const { ctx, engine } = setup();
    await engine.unlock();
    const listener = vi.fn();
    engine.subscribe(listener);

    ctx.setState('interrupted');
    expect(engine.isUnlocked()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('sound effects', () => {
  it('play("go") creates, starts and routes oscillators to the speakers', async () => {
    const { ctx, engine } = setup();
    await engine.unlock();
    engine.play('go');

    expect(ctx.oscillators.length).toBeGreaterThan(0);
    for (const osc of ctx.oscillators) {
      expect(osc.start).toHaveBeenCalled();
      expect(osc.stop).toHaveBeenCalled();
      expect(reaches(osc, ctx.destination)).toBe(true);
    }
    const main = defined(ctx.oscillators[0]);
    expect(main.type).toBe('square');
    expect(main.frequency.setValueAtTime).toHaveBeenCalledWith(880, expect.any(Number));
  });

  it('plays every effect', async () => {
    const { ctx, engine } = setup();
    await engine.unlock();
    for (const name of ALL_SFX) {
      const before = ctx.voiceCount();
      engine.play(name);
      expect(ctx.voiceCount(), name).toBeGreaterThan(before);
    }
  });

  it('is silent while locked or muted', async () => {
    const { ctx, engine } = setup();
    engine.play('go');
    expect(ctx.createOscillator).not.toHaveBeenCalled();

    await engine.unlock();
    engine.setMuted(true);
    engine.play('go');
    expect(ctx.createOscillator).not.toHaveBeenCalled();
  });

  it('throttles the answer tick to one per 60 ms', async () => {
    const { ctx, engine } = setup();
    await engine.unlock();

    for (let i = 0; i < 5; i++) engine.play('answer');
    expect(ctx.oscillators).toHaveLength(1);

    ctx.currentTime = 0.03;
    engine.play('answer');
    expect(ctx.oscillators).toHaveLength(1);

    ctx.currentTime = 0.07;
    engine.play('answer');
    expect(ctx.oscillators).toHaveLength(2);
  });

  it('disconnects voices once they have ended', async () => {
    const { ctx, engine } = setup();
    await engine.unlock();
    engine.play('click');

    const osc = defined(ctx.oscillators[0]);
    const amp = defined(osc.connections[0]) as FakeGain;
    osc.onended?.();
    expect(osc.disconnect).toHaveBeenCalled();
    expect(amp.disconnect).toHaveBeenCalled();
  });

  it('zeroes voice gains up front so nothing leaks out before the attack', async () => {
    const { ctx, engine } = setup();
    await engine.unlock();
    const busCount = ctx.gains.length;
    engine.play('whoosh');
    engine.play('go');

    const voiceGains = ctx.gains.slice(busCount);
    expect(voiceGains.length).toBeGreaterThan(0);
    for (const amp of voiceGains) expect(amp.gain.value).toBe(0);
  });

  it('reuses one cached noise buffer', async () => {
    const { ctx, engine } = setup();
    await engine.unlock();
    engine.play('whoosh');
    ctx.currentTime = 1;
    engine.play('whoosh');

    expect(ctx.bufferSources).toHaveLength(2);
    expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
    expect(ctx.bufferSources[0]?.buffer).toBe(ctx.bufferSources[1]?.buffer);
  });
});

describe('music', () => {
  it('starts a track requested before unlock once unlocked', async () => {
    vi.useFakeTimers();
    const { ctx, engine } = setup();
    engine.setMusic('lobby');
    run(ctx, 0.5);
    expect(ctx.createOscillator).not.toHaveBeenCalled();

    await engine.unlock();
    expect(ctx.oscillators.length).toBeGreaterThan(0);

    const scheduled = ctx.voiceCount();
    run(ctx, 1);
    expect(ctx.voiceCount()).toBeGreaterThan(scheduled);
  });

  it('schedules steps ahead on the audio clock grid', async () => {
    vi.useFakeTimers();
    const { ctx, engine } = setup();
    await engine.unlock();
    engine.setMusic('race');
    run(ctx, 1);

    // The race kick is four-on-the-floor: every 4th 16th at 150 BPM = 0.4 s, starting 50 ms after the request.
    const kicks = ctx.oscillators
      .filter((osc) => osc.type === 'sine' && osc.frequency.setValueAtTime.mock.calls[0]?.[0] === 150)
      .map((osc) => osc.start.mock.calls[0]?.[0]);
    expect(kicks.slice(0, 3)).toEqual([0.05, 0.45, 0.85].map((time) => expect.closeTo(time, 6)));
  });

  it('is idempotent and fades the previous track out when switching', async () => {
    vi.useFakeTimers();
    const { ctx, engine } = setup();
    await engine.unlock();
    engine.setMusic('lobby');
    run(ctx, 0.2);

    const gains = ctx.gains.length;
    engine.setMusic('lobby');
    expect(ctx.gains).toHaveLength(gains);

    const switchedAt = ctx.currentTime;
    engine.setMusic('race');
    const fadedOut = ctx.gains.some((gain) =>
      gain.gain.linearRampToValueAtTime.mock.calls.some(
        ([value, time]) => value === 0 && Math.abs((time as number) - (switchedAt + 0.3)) < 1e-9,
      ),
    );
    expect(fadedOut).toBe(true);
    expect(ctx.gains.length).toBeGreaterThan(gains);
  });

  it("stops scheduling on 'none'", async () => {
    vi.useFakeTimers();
    const { ctx, engine } = setup();
    await engine.unlock();
    engine.setMusic('results');
    run(ctx, 0.5);

    engine.setMusic('none');
    const voices = ctx.voiceCount();
    run(ctx, 2);
    expect(ctx.voiceCount()).toBe(voices);
  });

  it('keeps the beat but creates no voices while muted', async () => {
    vi.useFakeTimers();
    const { ctx, engine } = setup();
    await engine.unlock();
    engine.setMusic('race');
    engine.setMuted(true);

    const voices = ctx.voiceCount();
    run(ctx, 1);
    expect(ctx.voiceCount()).toBe(voices);

    engine.setMuted(false);
    run(ctx, 0.5);
    expect(ctx.voiceCount()).toBeGreaterThan(voices);
  });

  it('stops everything and closes the context on dispose', async () => {
    vi.useFakeTimers();
    const { ctx, engine } = setup();
    await engine.unlock();
    engine.setMusic('race');
    run(ctx, 0.5);

    engine.dispose();
    expect(ctx.close).toHaveBeenCalledTimes(1);
    expect(engine.isUnlocked()).toBe(false);

    const voices = ctx.voiceCount();
    run(ctx, 2);
    engine.play('go');
    expect(ctx.voiceCount()).toBe(voices);
  });
});

describe('getSoundEngine', () => {
  it('returns one shared engine until it is disposed', () => {
    const shared = getSoundEngine();
    expect(getSoundEngine()).toBe(shared);

    shared.dispose();
    const fresh = getSoundEngine();
    expect(fresh).not.toBe(shared);
    fresh.dispose();
  });
});
