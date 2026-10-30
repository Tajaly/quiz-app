import type { NoteEvent, Song } from './music';
import { disconnectAll, midiToFreq, type Synth } from './synth';

const TICK_MS = 25;
const LOOKAHEAD = 0.12;
/** Background tabs throttle timers to about once per second, so schedule further ahead there. */
const HIDDEN_LOOKAHEAD = 1.2;
/** Upper bound of steps scheduled per tick; protects against runaway loops. */
const MAX_STEPS_PER_TICK = 64;
/** Fraction of its written length a note actually sounds, so repeated notes re-articulate. */
const GATE = 0.9;
const ECHO_FEEDBACK = 0.3;
/** Instrument levels within a song, balanced by measuring each part solo. */
const MIX: Readonly<Record<NoteEvent['instrument'], number>> = {
  lead: 0.21,
  harmony: 0.16,
  bass: 0.31,
  kick: 0.52,
  snare: 0.43,
  hat: 0.19,
  openHat: 0.15,
};

export interface SongOutputs {
  /** Everything except the lead. */
  main: AudioNode;
  /** The lead, which may additionally feed an echo. */
  lead: AudioNode;
}

export function stepDuration(song: Song): number {
  return 60 / song.bpm / 4;
}

export function playEvent(
  synth: Synth,
  outs: SongOutputs,
  song: Song,
  event: NoteEvent,
  time: number,
  gain = 1,
): void {
  const duration = event.length * stepDuration(song) * GATE;
  const volume = MIX[event.instrument] * gain * (event.accent ? 1.4 : 1);
  switch (event.instrument) {
    case 'lead':
      synth.tone(outs.lead, {
        wave: song.leadWave,
        freq: midiToFreq(event.midi),
        start: time,
        duration,
        volume,
        decay: 0.35,
        sustain: 0.65,
        release: 0.06,
        vibrato: true,
      });
      break;
    case 'harmony':
      synth.tone(outs.main, {
        wave: song.harmonyWave,
        freq: midiToFreq(event.midi),
        start: time,
        duration,
        volume,
        attack: 0.002,
        decay: 0.08,
        sustain: 0.5,
        release: 0.04,
      });
      break;
    case 'bass':
      synth.tone(outs.main, {
        wave: 'triangle',
        freq: midiToFreq(event.midi),
        start: time,
        duration,
        volume,
        attack: 0.003,
        decay: 0.4,
        sustain: 0.8,
        release: 0.03,
      });
      break;
    case 'kick':
      synth.kick(outs.main, time, volume);
      break;
    case 'snare':
      synth.snare(outs.main, time, volume);
      break;
    case 'hat':
      synth.hat(outs.main, time, volume);
      break;
    case 'openHat':
      synth.hat(outs.main, time, volume, true);
      break;
  }
}

/** Schedules a whole song exactly once (used for short jingles); `gain` scales every voice. */
export function playOnce(synth: Synth, out: AudioNode, song: Song, start: number, gain = 1): void {
  const step = stepDuration(song);
  const outs = { main: out, lead: out };
  song.steps.forEach((events, index) => {
    for (const event of events) playEvent(synth, outs, song, event, start + index * step, gain);
  });
}

function isPageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * Loops a song with the classic "lookahead" pattern: a coarse JS timer wakes up every 25 ms and
 * schedules every 16th step that falls within the next ~120 ms on the sample-accurate audio clock.
 */
export class Sequencer {
  private readonly synth: Synth;
  private readonly song: Song;
  private readonly isSilent: () => boolean;
  private readonly stepTime: number;
  private readonly out: GainNode;
  private readonly outs: SongOutputs;
  private readonly nodes: AudioNode[];
  private timer: ReturnType<typeof setInterval> | undefined;
  private stopped = false;
  private step = 0;
  private nextTime: number;

  /** `isSilent` lets the owner skip creating voices (e.g. while muted) without losing the beat. */
  constructor(synth: Synth, destination: AudioNode, song: Song, startTime: number, isSilent: () => boolean) {
    const { ctx } = synth;
    this.synth = synth;
    this.song = song;
    this.isSilent = isSilent;
    this.stepTime = stepDuration(song);
    this.nextTime = startTime;

    this.out = ctx.createGain();
    this.out.connect(destination);
    const lead = ctx.createGain();
    lead.connect(this.out);
    this.nodes = [this.out, lead];
    if (song.echo > 0) {
      // Tempo-synced dotted-8th echo on the lead only; drums stay dry.
      const send = ctx.createGain();
      const delay = ctx.createDelay(1);
      const feedback = ctx.createGain();
      send.gain.value = song.echo;
      delay.delayTime.value = Math.min(this.stepTime * 3, 1);
      feedback.gain.value = ECHO_FEEDBACK;
      lead.connect(send);
      send.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(this.out);
      this.nodes.push(send, delay, feedback);
    }
    this.outs = { main: this.out, lead };
  }

  start(): void {
    if (this.stopped || this.timer !== undefined) return;
    this.tick();
    if (!this.stopped) this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  /** Stops scheduling, fades out what is already queued and releases the nodes afterwards. */
  stop(fadeSeconds: number): void {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.timer);
    this.timer = undefined;
    try {
      const { gain } = this.out;
      const now = this.synth.ctx.currentTime;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(0, now + fadeSeconds);
    } catch {
      // The context is already closed; nothing left to fade.
    }
    const lingerMs = (fadeSeconds + HIDDEN_LOOKAHEAD) * 1000;
    setTimeout(() => disconnectAll(this.nodes), lingerMs);
  }

  private tick(): void {
    try {
      const now = this.synth.ctx.currentTime;
      if (this.nextTime < now) {
        // The timer was throttled: skip the missed steps instead of firing them all at once.
        this.advance(Math.ceil((now - this.nextTime) / this.stepTime));
      }
      const horizon = now + (isPageHidden() ? HIDDEN_LOOKAHEAD : LOOKAHEAD);
      for (let i = 0; i < MAX_STEPS_PER_TICK && this.nextTime < horizon; i++) {
        if (!this.isSilent()) this.scheduleStep();
        this.advance(1);
      }
    } catch {
      this.stop(0);
    }
  }

  private scheduleStep(): void {
    const events = this.song.steps[this.step];
    if (!events?.length) return;
    const swing = this.step % 2 === 1 ? this.song.swing * this.stepTime : 0;
    for (const event of events) playEvent(this.synth, this.outs, this.song, event, this.nextTime + swing);
  }

  private advance(steps: number): void {
    this.step = (this.step + steps) % this.song.length;
    this.nextTime += steps * this.stepTime;
  }
}
