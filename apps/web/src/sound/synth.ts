/** Chiptune voices built from raw Web Audio nodes. Every voice disconnects itself once it has finished. */

export type Wave = 'square' | 'triangle' | 'sine' | 'sawtooth' | 'pulse25' | 'pulse12';

export interface Glide {
  /** Target value (Hz). */
  to: number;
  /** Seconds after the start; defaults to the note duration. */
  time?: number;
}

export interface ToneOptions {
  wave: Wave;
  freq: number;
  /** AudioContext time of the note-on. */
  start: number;
  /** Seconds from the note-on until the release begins. */
  duration: number;
  volume: number;
  attack?: number;
  /** Time constant of the decay from the peak towards `sustain`. */
  decay?: number;
  /** Sustain level as a fraction of `volume` (1 = no decay). */
  sustain?: number;
  /** Seconds from the release until silence. */
  release?: number;
  /** Exponential pitch glide. */
  slide?: Glide;
  /** Fixed detune in cents. */
  detune?: number;
  /** Delayed vibrato for long melodic notes. */
  vibrato?: boolean;
}

export interface NoiseOptions {
  start: number;
  duration: number;
  volume: number;
  filter: BiquadFilterType;
  freq: number;
  /** Exponential filter sweep. */
  sweep?: Glide;
  q?: number;
  attack?: number;
  release?: number;
}

const NOTE_OFFSETS: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const NOISE_SECONDS = 1;
const PULSE_HARMONICS = 32;
const VIBRATO_MIN_DURATION = 0.25;

/** Parses scientific pitch notation (`A4`, `F#3`, `Bb5`) into a MIDI note number, or `null` if invalid. */
export function noteToMidi(name: string): number | null {
  const match = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!match) return null;
  const [, letter = '', accidental = '', octave = ''] = match;
  const offset = NOTE_OFFSETS[letter];
  if (offset === undefined) return null;
  const shift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  return (Number(octave) + 1) * 12 + offset + shift;
}

export function midiToNote(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12] ?? 'C';
  return `${name}${Math.floor(midi / 12) - 1}`;
}

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

interface Envelope {
  start: number;
  hold: number;
  peak: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

/** Linear attack, exponential decay towards the sustain level, exponential release. Returns the time of silence. */
function applyEnvelope(param: AudioParam, env: Envelope): number {
  const releaseAt = env.start + Math.max(env.hold, env.attack);
  // A new gain defaults to 1; sources can start a fraction of a frame before the first event, so zero it now.
  param.value = 0;
  param.setValueAtTime(0, env.start);
  param.linearRampToValueAtTime(env.peak, env.start + env.attack);
  if (env.sustain < 1) param.setTargetAtTime(env.peak * env.sustain, env.start + env.attack, env.decay);
  // After five time constants the level is below 1 % of the peak, so stopping there does not click.
  param.setTargetAtTime(0, releaseAt, env.release / 5);
  return releaseAt + env.release;
}

export function disconnectAll(nodes: readonly AudioNode[]): void {
  for (const node of nodes) {
    try {
      node.disconnect();
    } catch {
      // Already disconnected.
    }
  }
}

export class Synth {
  readonly ctx: BaseAudioContext;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly pulseWaves = new Map<number, PeriodicWave>();

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
  }

  /** Plays one enveloped oscillator note and returns the oscillator for extra pitch automation. */
  tone(out: AudioNode, options: ToneOptions): OscillatorNode {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    this.setWave(osc, options.wave);
    osc.frequency.setValueAtTime(options.freq, options.start);
    if (options.slide) {
      const time = options.start + (options.slide.time ?? options.duration);
      osc.frequency.exponentialRampToValueAtTime(options.slide.to, time);
    }
    if (options.detune) osc.detune.value = options.detune;
    const end = applyEnvelope(amp.gain, {
      start: options.start,
      hold: options.duration,
      peak: options.volume,
      attack: options.attack ?? 0.005,
      decay: options.decay ?? 0.1,
      sustain: options.sustain ?? 1,
      release: options.release ?? 0.04,
    });
    osc.connect(amp);
    amp.connect(out);
    const nodes: AudioNode[] = [osc, amp];
    if (options.vibrato && options.duration >= VIBRATO_MIN_DURATION) {
      nodes.push(...this.vibrato(osc, options.start, end));
    }
    osc.onended = () => disconnectAll(nodes);
    osc.start(options.start);
    osc.stop(end);
    return osc;
  }

  /** Plays filtered white noise and returns the filter for extra sweeps. */
  noise(out: AudioNode, options: NoiseOptions): BiquadFilterNode {
    const { ctx } = this;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    source.buffer = this.getNoiseBuffer();
    source.loop = true;
    filter.type = options.filter;
    filter.frequency.setValueAtTime(options.freq, options.start);
    if (options.sweep) {
      const time = options.start + (options.sweep.time ?? options.duration);
      filter.frequency.exponentialRampToValueAtTime(options.sweep.to, time);
    }
    if (options.q !== undefined) filter.Q.value = options.q;
    const end = applyEnvelope(amp.gain, {
      start: options.start,
      hold: options.duration,
      peak: options.volume,
      attack: options.attack ?? 0.002,
      decay: 0.1,
      sustain: 1,
      release: options.release ?? 0.05,
    });
    source.connect(filter);
    filter.connect(amp);
    amp.connect(out);
    source.onended = () => disconnectAll([source, filter, amp]);
    // A random offset into the shared buffer keeps repeated hits from sounding identical.
    source.start(options.start, Math.random() * NOISE_SECONDS);
    source.stop(end);
    return filter;
  }

  /** Sine kick with a fast downward pitch drop. */
  kick(out: AudioNode, time: number, volume: number): void {
    this.tone(out, {
      wave: 'sine',
      freq: 150,
      slide: { to: 42, time: 0.12 },
      start: time,
      duration: 0.04,
      volume,
      attack: 0.002,
      release: 0.25,
    });
  }

  /** Noise burst with a short triangle "body". */
  snare(out: AudioNode, time: number, volume: number): void {
    this.noise(out, { filter: 'highpass', freq: 1400, start: time, duration: 0.02, volume, release: 0.16 });
    this.tone(out, {
      wave: 'triangle',
      freq: 210,
      slide: { to: 130, time: 0.07 },
      start: time,
      duration: 0.02,
      volume: volume * 0.7,
      attack: 0.001,
      release: 0.08,
    });
  }

  hat(out: AudioNode, time: number, volume: number, open = false): void {
    this.noise(out, {
      filter: 'highpass',
      freq: open ? 6500 : 8000,
      start: time,
      duration: open ? 0.04 : 0.008,
      volume,
      attack: 0.001,
      release: open ? 0.25 : 0.045,
    });
  }

  private vibrato(osc: OscillatorNode, start: number, end: number): AudioNode[] {
    const lfo = this.ctx.createOscillator();
    const depth = this.ctx.createGain();
    lfo.frequency.value = 5.5;
    depth.gain.value = 0;
    depth.gain.setValueAtTime(0, start + 0.15);
    depth.gain.linearRampToValueAtTime(18, start + 0.35); // cents
    lfo.connect(depth);
    depth.connect(osc.detune);
    lfo.start(start);
    lfo.stop(end);
    return [lfo, depth];
  }

  private setWave(osc: OscillatorNode, wave: Wave): void {
    if (wave === 'pulse25' || wave === 'pulse12') {
      osc.setPeriodicWave(this.pulseWave(wave === 'pulse25' ? 0.25 : 0.125));
    } else {
      osc.type = wave;
    }
  }

  /** Band-limited NES-style pulse wave with the given duty cycle (Fourier series of a rectangular wave). */
  private pulseWave(duty: number): PeriodicWave {
    let wave = this.pulseWaves.get(duty);
    if (!wave) {
      const real = new Float32Array(PULSE_HARMONICS);
      const imag = new Float32Array(PULSE_HARMONICS);
      for (let n = 1; n < PULSE_HARMONICS; n++) {
        real[n] = Math.sin(2 * Math.PI * n * duty) / (Math.PI * n);
        imag[n] = (2 * Math.sin(Math.PI * n * duty) ** 2) / (Math.PI * n);
      }
      wave = this.ctx.createPeriodicWave(real, imag);
      this.pulseWaves.set(duty, wave);
    }
    return wave;
  }

  private getNoiseBuffer(): AudioBuffer {
    if (!this.noiseBuffer) {
      const { sampleRate } = this.ctx;
      const length = Math.floor(sampleRate * NOISE_SECONDS);
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    }
    return this.noiseBuffer;
  }
}
